"use client";

import { StockfishEngine } from "./uci";

/**
 * Boot the engine with real progress, instead of a silent seven-megabyte pause.
 *
 * The worker fetches its own `.wasm` internally and gives us no way to observe
 * that download, so the first game used to sit on a motionless "waking up"
 * message for as long as the network took — indistinguishable from a hang.
 *
 * The fix is to fetch the same URL ourselves first, streaming it so bytes can be
 * counted, and only then start the worker. The file is served `public,
 * max-age=0` with an ETag, so by the time the worker asks for it the browser has
 * it cached and the request collapses to a conditional 304 — progress is real
 * and nothing is downloaded twice.
 */

const WASM_URL = "/chess-coach/engine/stockfish-18-lite-single.wasm";

export type BootPhase = "downloading" | "starting" | "ready";

export type BootProgress = {
  phase: BootPhase;
  /** 0-100. Only meaningful while downloading; 100 otherwise. */
  pct: number;
  loadedBytes: number;
  totalBytes: number;
};

/**
 * Stream the engine binary so its size can be reported, discarding the bytes —
 * the browser cache keeps them, and holding 7 MB in JS memory would be pointless.
 *
 * Failure here is deliberately non-fatal: the worker can still fetch the file
 * itself, so a blocked prefetch costs a progress bar rather than the feature.
 */
async function prefetchWasm(onProgress: (progress: BootProgress) => void): Promise<void> {
  try {
    const response = await fetch(WASM_URL);
    if (!response.ok || !response.body) return;

    const totalBytes = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    let loadedBytes = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loadedBytes += value.byteLength;
      onProgress({
        phase: "downloading",
        pct: totalBytes ? Math.min(100, (loadedBytes / totalBytes) * 100) : 0,
        loadedBytes,
        totalBytes,
      });
    }
  } catch {
    // Ignored on purpose — see above.
  }
}

/** Download, start, and hand back a ready engine. */
export async function bootEngine(
  onProgress: (progress: BootProgress) => void = () => {},
): Promise<StockfishEngine> {
  await prefetchWasm(onProgress);

  // Compiling and instantiating the module takes a noticeable moment of its own
  // on slower machines, so it gets its own phase rather than appearing as a
  // stall at 100%.
  onProgress({ phase: "starting", pct: 100, loadedBytes: 0, totalBytes: 0 });

  const engine = new StockfishEngine();
  await engine.waitUntilReady();

  onProgress({ phase: "ready", pct: 100, loadedBytes: 0, totalBytes: 0 });
  return engine;
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
