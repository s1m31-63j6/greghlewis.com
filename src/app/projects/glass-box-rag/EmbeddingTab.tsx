"use client";

import { useMemo, useState } from "react";

import casesData from "@/lib/glass-box-rag/cases.json";
import edgesData from "@/lib/glass-box-rag/citation_edges.json";
import projection from "@/lib/glass-box-rag/projection.json";
import { COPY, useLevel } from "./copy";
import { EmbeddingInspector } from "./EmbeddingInspector";
import { Expandable } from "./Expandable";
import type { Trace } from "./useGlassBoxRag";

/**
 * A 2D t-SNE projection of every chunk, computed offline. The map has two modes:
 *
 *  - AT REST it shows corpus structure: each case is a hub sized and shaded by how
 *    often the rest of the corpus cites it, so the fair-use canon surfaces as the
 *    biggest, darkest hubs. The non-copyright control group is muted gray — present
 *    but clearly not the story.
 *  - DURING A QUERY it re-weights to *that* query: cases the search pulled in grow
 *    and turn blue (darkest = used in the final answer), and everything the search
 *    ignored recedes. So an insurance question lights up the normally-gray insurance
 *    cases — you can watch the retriever tell domains apart.
 *
 * A key under the map labels whichever mode is active.
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
interface Edge {
  source: string;
  target: string;
  weight: number;
}

const POINTS = projection as Point[];
const EDGES = edgesData as Edge[];
const DOMAIN = new Map((casesData as { id: string; domain: string }[]).map((c) => [c.id, c.domain]));

const CASES = (() => {
  const acc = new Map<
    string,
    { id: string; name: string; layer: string; court: string; year: number; sx: number; sy: number; n: number }
  >();
  for (const p of POINTS) {
    const c = acc.get(p.case_id) ?? {
      id: p.case_id,
      name: p.case_name,
      layer: p.layer,
      court: p.court,
      year: p.year,
      sx: 0,
      sy: 0,
      n: 0,
    };
    c.sx += p.x;
    c.sy += p.y;
    c.n += 1;
    acc.set(p.case_id, c);
  }
  const inDeg = new Map<string, number>();
  for (const e of EDGES) inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + e.weight);
  return [...acc.values()].map((c) => ({
    id: c.id,
    name: c.name,
    layer: c.layer,
    court: c.court,
    year: c.year,
    x: c.sx / c.n,
    y: c.sy / c.n,
    deg: inDeg.get(c.id) ?? 0,
  }));
})();

const MAX_DEG = Math.max(...CASES.map((c) => c.deg));
const CENTROID = new Map(CASES.map((c) => [c.id, c] as const));
const shortName = (n: string) => n.replace(/,? (Inc|LLC|Co|Corp)\.?.*$/, "").split(" v. ")[0];

// a representative chunk per case (the point nearest the centroid) — the target
// when someone clicks a hub rather than an individual passage.
const REP = (() => {
  const best = new Map<string, { id: string; d: number }>();
  for (const p of POINTS) {
    const c = CENTROID.get(p.case_id);
    if (!c) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    const cur = best.get(p.case_id);
    if (!cur || d < cur.d) best.set(p.case_id, { id: p.id, d });
  }
  return new Map([...best].map(([k, v]) => [k, v.id] as const));
})();

// resting color: copyright hubs on a blue authority ramp; control group muted gray.
function restColor(deg: number, control: boolean) {
  if (control) return "#94a3b8"; // slate-400 — receding
  const t = Math.sqrt(deg / MAX_DEG);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(0xbf, 0x1e)},${lerp(0xdb, 0x40)},${lerp(0xfe, 0xaf)})`; // blue-200 → blue-800
}

export function EmbeddingTab({ trace }: { trace: Trace | null }) {
  const level = useLevel();
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);

  // Query signals: which chunks were seen, which cases were used, and a per-case
  // relevance from the latest stage that retrieved it (normalized 0–1 for sizing).
  const { usedCases, consideredCases, seenChunks, relNorm, hasQuery } = useMemo(() => {
    const usedCases = new Set(trace?.citations.map((c) => c.case_id) ?? []);
    const consideredCases = new Set<string>();
    const seenChunks = new Set<string>();
    const rawScore = new Map<string, number>();
    for (const s of trace?.stages ?? []) {
      for (const d of s.docs ?? []) {
        consideredCases.add(d.case_id);
        seenChunks.add(d.chunk_id);
        rawScore.set(d.case_id, d.score); // latest stage wins → most-refined relevance
      }
    }
    const scores = [...rawScore.values()];
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    const relNorm = new Map<string, number>();
    for (const [id, sc] of rawScore) relNorm.set(id, hi > lo ? (sc - lo) / (hi - lo) : 1);
    return {
      usedCases,
      consideredCases,
      seenChunks,
      relNorm,
      hasQuery: usedCases.size > 0 || consideredCases.size > 0,
    };
  }, [trace]);

  const restLabels = useMemo(
    () => new Set([...CASES].sort((a, b) => b.deg - a.deg).slice(0, 7).map((c) => c.id)),
    [],
  );

  // per-case display props, branched on mode
  const propsFor = (c: (typeof CASES)[number]) => {
    const control = DOMAIN.get(c.id) !== "copyright";
    if (!hasQuery) {
      const t = Math.sqrt(c.deg / MAX_DEG);
      return {
        r: 0.016 + t * 0.05,
        fill: restColor(c.deg, control),
        opacity: 0.95,
        ring: "#ffffff",
        ringW: 0.004,
        label: restLabels.has(c.id),
      };
    }
    if (usedCases.has(c.id))
      return { r: 0.058, fill: "#1e40af", opacity: 1, ring: "#ffffff", ringW: 0.007, label: true };
    if (consideredCases.has(c.id)) {
      const n = relNorm.get(c.id) ?? 0;
      return { r: 0.022 + n * 0.03, fill: "#60a5fa", opacity: 0.92, ring: "#ffffff", ringW: 0.003, label: n > 0.6 };
    }
    return { r: 0.006, fill: "#cbd5e1", opacity: 0.25, ring: "#ffffff", ringW: 0, label: false };
  };

  const chart = (isBig: boolean) => (
    <div>
      <Key hasQuery={hasQuery} />
      <div className="relative">
      <svg
        viewBox="-1.15 -1.15 2.3 2.3"
        style={{ width: isBig ? "auto" : "100%", height: isBig ? "78vh" : "auto", maxWidth: "100%" }}
      >
        {/* pencil citation lines between case centroids */}
        {EDGES.map((e) => {
          const s = CENTROID.get(e.source);
          const t = CENTROID.get(e.target);
          if (!s || !t) return null;
          const hot = usedCases.has(e.source) && usedCases.has(e.target);
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={hot ? "#1d4ed8" : "#cbd5e1"}
              strokeWidth={hot ? 0.006 : 0.0015 + (e.weight / MAX_DEG) * 0.01}
              opacity={hot ? 0.8 : hasQuery ? 0.15 : 0.3}
            />
          );
        })}

        {/* faint chunk cloud for context — each passage is clickable to inspect */}
        {POINTS.map((p) => {
          const seen = seenChunks.has(p.id);
          return (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={seen ? 0.013 : 0.008}
              fill={seen ? "#64748b" : p.layer === "modern" ? "#e2e8f0" : "#f1f5f9"}
              opacity={seen ? 0.85 : 0.5}
              onClick={() => setInspectId(p.id)}
              style={{ cursor: "pointer" }}
            >
              <title>
                {p.case_name} ({p.year}) — click to inspect its embedding
              </title>
            </circle>
          );
        })}

        {/* case hubs */}
        {CASES.map((c) => {
          const d = propsFor(c);
          return (
            <g key={c.id}>
              <circle
                className="gbr-hub"
                cx={c.x}
                cy={c.y}
                r={d.r}
                fill={d.fill}
                stroke={d.ring}
                strokeWidth={d.ringW}
                opacity={d.opacity}
                onMouseEnter={() => setHover(c.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setInspectId(REP.get(c.id) ?? null)}
                style={{ cursor: "pointer" }}
              />
              {d.label && (
                <text
                  x={c.x}
                  y={c.y - d.r - 0.012}
                  textAnchor="middle"
                  style={{
                    fontSize: 0.05,
                    fontWeight: 600,
                    fill: hasQuery ? "#1e40af" : DOMAIN.get(c.id) !== "copyright" ? "#64748b" : "#475569",
                  }}
                >
                  {shortName(c.name)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover && CENTROID.get(hover) && (
        <div className="pointer-events-none absolute left-2 top-2 rounded border border-slate-200 bg-white/95 px-2 py-1 text-[11px] shadow-sm">
          <span className="text-slate-800">{CENTROID.get(hover)!.name}</span>{" "}
          <span className="text-slate-400">
            ({CENTROID.get(hover)!.court}, {CENTROID.get(hover)!.year})
          </span>
          <span className="block text-slate-500">
            cited {CENTROID.get(hover)!.deg}× in the corpus
            {hasQuery &&
              (usedCases.has(hover)
                ? " · used in this answer"
                : consideredCases.has(hover)
                  ? " · retrieved for this query"
                  : " · not retrieved")}
          </span>
        </div>
      )}
      </div>
    </div>
  );

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] text-slate-500">
        {hasQuery ? COPY.embeddingActive[level] : COPY.embeddingIdle[level]}
      </p>

      <Expandable
        title="Embedding map — passages by meaning"
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        {chart}
      </Expandable>

      <p className="mt-1 text-[10px] text-slate-400">
        {POINTS.length} passages · {CASES.length} cases · t-SNE over 1024-dim Titan v2 embeddings,
        cosine metric. <span className="text-slate-500">Click any passage or hub to inspect its
        vector.</span>
      </p>

      {inspectId && (
        <EmbeddingInspector chunkId={inspectId} onClose={() => setInspectId(null)} />
      )}
    </div>
  );
}

/** The key — labels whichever mode the map is in. */
function Key({ hasQuery }: { hasQuery: boolean }) {
  const Dot = ({ color, size = 10 }: { color: string; size?: number }) => (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-[10px] text-slate-500">
      {hasQuery ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-slate-600">This query — size = relevance:</span>
          <span className="flex items-center gap-1">
            <Dot color="#1e40af" size={12} /> used in the answer
          </span>
          <span className="flex items-center gap-1">
            <Dot color="#60a5fa" /> retrieved
          </span>
          <span className="flex items-center gap-1">
            <Dot color="#cbd5e1" size={7} /> not retrieved
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-slate-600">Resting — size = times cited:</span>
          <span className="flex items-center gap-1">
            <Dot color="#1e40af" /> copyright <span className="text-slate-400">(darker = cited more)</span>
          </span>
          <span className="flex items-center gap-1">
            <Dot color="#94a3b8" /> control group
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-4 bg-slate-300" /> citation
          </span>
        </div>
      )}
    </div>
  );
}
