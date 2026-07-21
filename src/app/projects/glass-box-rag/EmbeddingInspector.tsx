"use client";

import { useEffect, useRef, useState } from "react";

import {
  loadEmbeddingDetail,
  vectorFor,
  type ChunkDetail,
  type EmbeddingData,
} from "./embeddingDetail";

/**
 * The embedding inspector: click a passage and see (1) its text, (2) the actual
 * 1024-d Titan vector as a heatmap strip — "what the machine literally stores" —
 * and (3) its nearest neighbours by real cosine, each clickable so you can walk
 * the semantic graph. Opens as a modal over the map.
 */

// diverging heatmap: negative → blue, zero → pale, positive → gold
function cell(q: number): [number, number, number] {
  const t = q / 127; // -1..1
  const lerp = (a: number, b: number, u: number) => Math.round(a + (b - a) * u);
  if (t < 0) {
    const u = -t; // pale → blue
    return [lerp(0xf1, 0x1d, u), lerp(0xf5, 0x4e, u), lerp(0xf9, 0xd8, u)];
  }
  return [lerp(0xf1, 0xca, t), lerp(0xf5, 0x8a, t), lerp(0xf9, 0x04, t)]; // pale → gold
}

function VectorHeatmap({ vec }: { vec: Int8Array }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const n = vec.length;
    canvas.width = n; // one device pixel per dimension; CSS scales to full width
    canvas.height = 1;
    const img = ctx.createImageData(n, 1);
    for (let k = 0; k < n; k++) {
      const [r, g, b] = cell(vec[k]);
      img.data[k * 4] = r;
      img.data[k * 4 + 1] = g;
      img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [vec]);
  return (
    <canvas
      ref={ref}
      className="h-9 w-full rounded"
      style={{ imageRendering: "pixelated" }}
      aria-label="1024-dimensional embedding vector, shown as a heatmap"
    />
  );
}

export function EmbeddingInspector({
  chunkId,
  onClose,
}: {
  chunkId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<EmbeddingData | null>(null);
  const [id, setId] = useState(chunkId);

  useEffect(() => setId(chunkId), [chunkId]);
  useEffect(() => {
    let live = true;
    loadEmbeddingDetail().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chunk: ChunkDetail | undefined = data?.byId.get(id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <div>
            <p className="text-[13px] font-medium text-slate-900">
              {chunk ? chunk.case_name : "Loading passage…"}
            </p>
            {chunk && (
              <p className="text-[11px] text-slate-500">
                {chunk.court} · {chunk.year}
                {chunk.section && ` · ${chunk.section}`}
                {chunk.tokens && ` · ${chunk.tokens} tokens`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded px-2 py-0.5 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            Close ✕
          </button>
        </div>

        <div className="overflow-auto p-4">
          {!data && <p className="text-[12px] text-slate-400">Fetching embeddings…</p>}

          {chunk && data && (
            <>
              <p className="text-[12.5px] leading-relaxed text-slate-700">{chunk.text}</p>

              <div className="mt-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    Its embedding — {data.dims} dimensions
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#1d4ed8" }} />
                    −{data.maxabs.toFixed(2)}
                    <span className="mx-0.5">…</span>
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#ca8a04" }} />
                    +{data.maxabs.toFixed(2)}
                  </span>
                </div>
                <VectorHeatmap vec={vectorFor(data, chunk.i)} />
                <p className="mt-1 text-[10px] text-slate-400">
                  The single row of numbers Titan produces for this passage. Meaning lives in the
                  whole pattern, not any one cell — similarity is the alignment of two such rows.
                </p>
              </div>

              <div className="mt-4">
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                  Nearest passages by cosine — click to follow
                </p>
                <ul className="space-y-1">
                  {chunk.neighbors.map((nb) => (
                    <li key={nb.id}>
                      <button
                        onClick={() => data.byId.has(nb.id) && setId(nb.id)}
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50"
                      >
                        <span className="w-9 shrink-0 text-right font-mono text-[11px] text-slate-500">
                          {nb.sim.toFixed(2)}
                        </span>
                        <span className="relative h-2.5 w-16 shrink-0 overflow-hidden rounded-sm bg-slate-100">
                          <span
                            className="absolute inset-y-0 left-0 rounded-sm bg-blue-600"
                            style={{ width: `${Math.max(0, nb.sim) * 100}%` }}
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700">
                          {nb.case_name}
                          {nb.section && <span className="text-slate-400"> · {nb.section}</span>}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 text-[9px] ${
                            nb.same_case
                              ? "bg-slate-100 text-slate-500"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {nb.same_case ? "same case" : "cross-case"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
