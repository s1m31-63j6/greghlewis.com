"use client";

import { useMemo, useState } from "react";

import projection from "@/lib/glass-box-rag/projection.json";
import type { Trace } from "./useGlassBoxRag";

/**
 * A 2D t-SNE projection of every chunk in the corpus, computed offline and shipped
 * as static coordinates. Retrieved passages light up, so you can see whether an
 * answer drew from one tight cluster or reached across the space.
 */

interface Point {
  id: string;
  case_id: string;
  case_name: string;
  layer: string;
  court: string;
  year: number;
  x: number;
  y: number;
}

const POINTS = projection as Point[];

export function EmbeddingTab({ trace }: { trace: Trace | null }) {
  const [hover, setHover] = useState<Point | null>(null);

  // Chunks that survived to the final answer, plus every chunk seen at any stage —
  // the difference between "considered" and "used" is the interesting part.
  const { used, considered } = useMemo(() => {
    const usedCases = new Set(trace?.citations.map((c) => c.case_id) ?? []);
    const seen = new Set<string>();
    for (const s of trace?.stages ?? []) {
      for (const d of s.docs ?? []) seen.add(d.chunk_id);
    }
    return { used: usedCases, considered: seen };
  }, [trace]);

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] text-stone-500">
        {trace
          ? "Filled points were retrieved at some stage; dark points come from cases in the final answer."
          : "Every passage in the corpus, positioned by embedding similarity. Ask a question to see which regions it reaches."}
      </p>

      <div className="relative">
        <svg viewBox="-1.15 -1.15 2.3 2.3" className="w-full" style={{ height: 380 }}>
          {POINTS.map((p) => {
            const isUsed = used.has(p.case_id);
            const isSeen = considered.has(p.id);
            return (
              <circle
                key={p.id}
                cx={p.x}
                cy={p.y}
                r={isUsed ? 0.022 : isSeen ? 0.016 : 0.009}
                fill={
                  isUsed
                    ? "#1c1917"
                    : isSeen
                      ? "#78716c"
                      : p.layer === "modern"
                        ? "#d6d3d1"
                        : "#e7e5e4"
                }
                opacity={isUsed || isSeen ? 0.95 : 0.6}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>

        {hover && (
          <div className="pointer-events-none absolute left-2 top-2 rounded border border-stone-200 bg-white/95 px-2 py-1 text-[11px] shadow-sm">
            <span className="text-stone-800">{hover.case_name}</span>
            <span className="text-stone-400">
              {" "}
              ({hover.court}, {hover.year})
            </span>
          </div>
        )}
      </div>

      <p className="mt-1 text-[10px] text-stone-400">
        {POINTS.length} passages · t-SNE over 1024-dim Titan v2 embeddings, cosine metric
      </p>
    </div>
  );
}
