"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Wraps a visualization so it can pop into a large overlay for reading — the
 * instrument panel is narrow, and the citation graph and embedding map are too
 * dense to read at that width. The child is a render function of `expanded`, so
 * it can size itself (taller SVG, larger labels) in the overlay.
 */
export function Expandable({
  title,
  expanded,
  onExpandedChange,
  children,
}: {
  title: string;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  children: (expanded: boolean) => ReactNode;
}) {
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExpandedChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => onExpandedChange(true)}
          className="absolute right-0 top-0 z-10 flex items-center gap-1 rounded border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500 backdrop-blur hover:bg-slate-50 hover:text-slate-900"
          title="Expand"
        >
          <span className="text-[11px] leading-none">⤢</span> Expand
        </button>
        {children(false)}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 sm:p-8"
          onClick={() => onExpandedChange(false)}
        >
          <div
            className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-[12px] font-medium text-slate-700">{title}</span>
              <button
                onClick={() => onExpandedChange(false)}
                className="rounded px-2 py-0.5 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                Close ✕
              </button>
            </div>
            <div className="overflow-auto p-4">{children(true)}</div>
          </div>
        </div>
      )}
    </>
  );
}
