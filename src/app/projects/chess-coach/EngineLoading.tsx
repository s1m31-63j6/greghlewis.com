"use client";

import { formatMegabytes, type BootProgress } from "./engine/boot";

/**
 * Feedback while the engine downloads and starts.
 *
 * Says what is happening, how big it is, how far along it is, and that it only
 * happens once — which is the difference between "this is broken" and "this is
 * working, wait a moment".
 */
export function EngineLoading({ progress }: { progress: BootProgress }) {
  const downloading = progress.phase === "downloading";
  const pct = downloading ? progress.pct : 100;

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
      <p className="flex items-center gap-2 text-sm font-extrabold text-[#4B4B4B]">
        <span className="inline-block animate-bounce">♟️</span>
        {downloading ? "Downloading the chess engine…" : "Starting the engine…"}
      </p>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#EDEDED]">
        <div
          className={`h-full rounded-full bg-[#58CC02] transition-all duration-200 ${
            downloading ? "" : "animate-pulse"
          }`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>

      <p className="mt-2 text-xs font-bold text-[#AFAFAF]">
        {downloading && progress.totalBytes > 0
          ? `${formatMegabytes(progress.loadedBytes)} of ${formatMegabytes(progress.totalBytes)} · one-time download, cached after this`
          : "Almost there — compiling for your browser."}
      </p>
    </div>
  );
}

/** A board-shaped placeholder, so the layout does not jump when the board arrives. */
export function BoardSkeleton({ label = "Loading the board…" }: { label?: string }) {
  return (
    <div className="grid aspect-square w-full place-items-center rounded-3xl bg-[#EDEDED]">
      <p className="flex items-center gap-2 text-sm font-extrabold text-[#AFAFAF]">
        <span className="inline-block animate-bounce">♟️</span>
        {label}
      </p>
    </div>
  );
}
