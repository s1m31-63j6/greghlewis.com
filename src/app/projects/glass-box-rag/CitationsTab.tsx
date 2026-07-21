"use client";

import { useMemo } from "react";

import cases from "@/lib/glass-box-rag/cases.json";
import edges from "@/lib/glass-box-rag/citation_edges.json";
import type { Trace } from "./useGlassBoxRag";

/**
 * The citation graph, laid out as two columns: modern AI decisions on the left,
 * the doctrinal ancestors they argue over on the right. Precedent genuinely flows
 * one way through time, so a hierarchical layout reads better here than a
 * force-directed blob.
 *
 * Edge weight is how many times the source cites the target — a free authority
 * signal that reproduces the fair-use canon without being told it.
 */

interface Case {
  id: string;
  name: string;
  court: string;
  year: number;
  layer: string;
  domain: string;
  citation: string | null;
}
interface Edge {
  source: string;
  target: string;
  weight: number;
}

const CASES = cases as Case[];
const EDGES = edges as Edge[];

const ROW_H = 26;

export function CitationsTab({ trace }: { trace: Trace | null }) {
  const retrieved = useMemo(
    () => new Set(trace?.citations.map((c) => c.case_id) ?? []),
    [trace],
  );
  const followed = useMemo(
    () =>
      new Set(
        (trace?.assessments ?? []).flatMap((a) => a.follow.map((f) => f.case_id)),
      ),
    [trace],
  );

  const { modern, ancestors, inDegree } = useMemo(() => {
    const deg = new Map<string, number>();
    for (const e of EDGES) deg.set(e.target, (deg.get(e.target) ?? 0) + e.weight);
    const byWeight = (a: Case, b: Case) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0);
    return {
      modern: CASES.filter((c) => c.layer === "modern").sort((a, b) => a.year - b.year),
      ancestors: CASES.filter((c) => c.layer === "ancestor").sort(byWeight),
      inDegree: deg,
    };
  }, []);

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    modern.forEach((c, i) => m.set(c.id, { x: 8, y: 18 + i * ROW_H }));
    ancestors.forEach((c, i) => m.set(c.id, { x: 62, y: 18 + i * ROW_H }));
    return m;
  }, [modern, ancestors]);

  const height = 24 + Math.max(modern.length, ancestors.length) * ROW_H;
  const shown = EDGES.filter((e) => pos.has(e.source) && pos.has(e.target));
  const maxW = Math.max(...shown.map((e) => e.weight));

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] text-stone-500">
        {trace
          ? "Highlighted cases were retrieved for this question; amber edges were followed by the agent."
          : "Modern AI decisions on the left, the fair-use lineage they argue over on the right. Copper names are the non-copyright control group (insurance, patent, authorship) — note they form a separate cluster, barely citing the fair-use canon."}
      </p>
      <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }}>
        <text x="8" y="10" className="fill-stone-400" style={{ fontSize: 4 }}>
          MODERN AI CASES
        </text>
        <text x="62" y="10" className="fill-stone-400" style={{ fontSize: 4 }}>
          DOCTRINAL ANCESTORS
        </text>

        {shown.map((e) => {
          const s = pos.get(e.source)!;
          const t = pos.get(e.target)!;
          const active = retrieved.has(e.source) && retrieved.has(e.target);
          const hopped = followed.has(e.target) && retrieved.has(e.source);
          return (
            <path
              key={`${e.source}-${e.target}`}
              d={`M ${s.x + 26} ${s.y - 2} C 48 ${s.y - 2}, 48 ${t.y - 2}, ${t.x - 1} ${t.y - 2}`}
              fill="none"
              stroke={hopped ? "#b45309" : active ? "#1c1917" : "#d6d3d1"}
              strokeWidth={hopped ? 0.9 : (e.weight / maxW) * 0.8 + 0.12}
              opacity={active || hopped ? 0.9 : 0.35}
            />
          );
        })}

        {[...modern, ...ancestors].map((c) => {
          const p = pos.get(c.id)!;
          const on = retrieved.has(c.id);
          const deg = inDegree.get(c.id) ?? 0;
          const control = c.domain !== "copyright";
          const fill = on
            ? control
              ? "#9a3412"
              : "#1c1917"
            : control
              ? "#c2884e"
              : "#a8a29e";
          return (
            <g key={c.id}>
              <text
                x={p.x}
                y={p.y}
                style={{ fontSize: 3.4, fontWeight: on ? 600 : 400, fill }}
              >
                {c.name.length > 34 ? `${c.name.slice(0, 33)}…` : c.name}
              </text>
              <text x={p.x} y={p.y + 4} style={{ fontSize: 2.8 }} className="fill-stone-400">
                {c.court} · {c.year}
                {deg > 0 && ` · cited ${deg}×`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
