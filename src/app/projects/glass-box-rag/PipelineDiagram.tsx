"use client";

import { useState } from "react";

import type { StageName } from "@/lib/glass-box-rag/types";
import { STAGE_ROLE, useLevel } from "./copy";
import type { Trace } from "./useGlassBoxRag";

/**
 * The pipeline as a diagram, not a list — so you can SEE the route a query takes,
 * not just read it. A vertical spine with the one real fork (keyword vs. meaning
 * search) shown side by side, and the agentic hop drawn as a loop back into
 * retrieval. Each node lights blue while its stage runs and settles to a soft blue once it
 * has; hovering a node explains its job at the current reading level.
 *
 * Coordinates live in a 0–100 square viewBox; the SVG scales to the panel width.
 */

type Status = "idle" | "running" | "done";

interface Node {
  id: StageName;
  label: string;
  x: number; // top-left, in viewBox units
  y: number;
  w: number;
  h: number;
}

const NODES: Node[] = [
  { id: "analyze", label: "Analyze", x: 27, y: 2, w: 46, h: 8 },
  { id: "transform", label: "HyDE + variants", x: 27, y: 13, w: 46, h: 8 },
  { id: "retrieve_sparse", label: "BM25 · keywords", x: 8, y: 24, w: 40, h: 8 },
  { id: "retrieve_dense", label: "Vector · meaning", x: 52, y: 24, w: 40, h: 8 },
  { id: "fuse", label: "Fuse (RRF)", x: 27, y: 35, w: 46, h: 8 },
  { id: "temporal", label: "Temporal filter", x: 27, y: 46, w: 46, h: 8 },
  { id: "rerank", label: "Rerank", x: 27, y: 57, w: 46, h: 8 },
  { id: "diversify", label: "Diversify", x: 27, y: 68, w: 46, h: 8 },
  { id: "assess", label: "Assess", x: 27, y: 79, w: 46, h: 8 },
  { id: "hop", label: "Hop", x: 78, y: 79, w: 20, h: 8 },
  { id: "synthesize", label: "Synthesize", x: 27, y: 90, w: 46, h: 8 },
];

const cx = (n: Node) => n.x + n.w / 2;
const cy = (n: Node) => n.y + n.h / 2;
const byId = (id: StageName) => NODES.find((n) => n.id === id)!;

// straight center-to-center connectors along the spine
const SPINE: [StageName, StageName][] = [
  ["analyze", "transform"],
  ["fuse", "temporal"],
  ["temporal", "rerank"],
  ["rerank", "diversify"],
  ["diversify", "assess"],
  ["assess", "synthesize"],
];

function statusOf(trace: Trace | null, stage: StageName): Status {
  if (!trace) return "idle";
  const runs = trace.stages.filter((s) => s.stage === stage);
  if (runs.some((s) => s.running)) return "running";
  if (runs.length) return "done";
  return "idle";
}

function msOf(trace: Trace | null, stage: StageName): number | null {
  if (!trace) return null;
  const runs = trace.stages.filter((s) => s.stage === stage && s.ms !== undefined);
  if (!runs.length) return null;
  return runs.reduce((a, s) => a + (s.ms ?? 0), 0);
}

// blue = the machine at work (running strong, settling to a soft blue when done);
// the agentic hop is the one gold accent. neutrals are slate.
const STROKE: Record<Status, string> = {
  idle: "#cbd5e1", // slate-300
  running: "#1d4ed8", // blue-600
  done: "#93c5fd", // blue-300
};
const FILL: Record<Status, string> = {
  idle: "#ffffff",
  running: "#dbeafe", // blue-100
  done: "#eff6ff", // blue-50
};
const INK: Record<Status, string> = {
  idle: "#94a3b8", // slate-400
  running: "#0f172a", // slate-900
  done: "#1e293b", // slate-800
};
const GOLD = "#ca8a04"; // yellow-600 — the agentic hop accent
const GOLD_IDLE = "#e2e8f0"; // slate-200

export function PipelineDiagram({
  trace,
  selected,
  onSelect,
}: {
  trace: Trace | null;
  selected: StageName | null;
  onSelect: (s: StageName) => void;
}) {
  const level = useLevel();
  const [hover, setHover] = useState<StageName | null>(null);

  const hops = trace?.meta?.hops ?? (statusOf(trace, "hop") !== "idle" ? 1 : 0);
  const status = (s: StageName) => statusOf(trace, s);
  const edgeColor = (target: StageName) => {
    const st = status(target);
    return st === "running" ? "#1d4ed8" : st === "done" ? "#60a5fa" : "#e2e8f0";
  };

  const hovered = hover ? byId(hover) : null;

  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" className="w-full" style={{ maxHeight: "62vh" }}>
        {/* ---- connectors (drawn first, under nodes) ---- */}
        {SPINE.map(([a, b]) => {
          const from = byId(a);
          const to = byId(b);
          return (
            <line
              key={`${a}-${b}`}
              x1={cx(from)}
              y1={from.y + from.h}
              x2={cx(to)}
              y2={to.y}
              stroke={edgeColor(b)}
              strokeWidth={0.6}
            />
          );
        })}

        {/* transform → the two retrieval nodes (the fork) */}
        {(["retrieve_sparse", "retrieve_dense"] as StageName[]).map((s) => {
          const t = byId("transform");
          const to = byId(s);
          return (
            <path
              key={`fork-${s}`}
              d={`M ${cx(t)} ${t.y + t.h} C ${cx(t)} ${to.y - 4}, ${cx(to)} ${t.y + t.h}, ${cx(to)} ${to.y}`}
              fill="none"
              stroke={edgeColor(s)}
              strokeWidth={0.6}
            />
          );
        })}

        {/* the two retrieval nodes → fuse (converge) */}
        {(["retrieve_sparse", "retrieve_dense"] as StageName[]).map((s) => {
          const from = byId(s);
          const f = byId("fuse");
          return (
            <path
              key={`join-${s}`}
              d={`M ${cx(from)} ${from.y + from.h} C ${cx(from)} ${f.y - 4}, ${cx(f)} ${from.y + from.h}, ${cx(f)} ${f.y}`}
              fill="none"
              stroke={edgeColor("fuse")}
              strokeWidth={0.6}
            />
          );
        })}

        {/* assess → hop (the "not sufficient" branch) */}
        <line
          x1={byId("assess").x + byId("assess").w}
          y1={cy(byId("assess"))}
          x2={byId("hop").x}
          y2={cy(byId("hop"))}
          stroke={hops > 0 ? GOLD : GOLD_IDLE}
          strokeWidth={0.6}
        />

        {/* hop → back up into retrieval (the agentic loop) */}
        <path
          d={`M ${cx(byId("hop"))} ${byId("hop").y} C 99 60, 99 34, ${byId("retrieve_dense").x + byId("retrieve_dense").w} 28`}
          fill="none"
          stroke={hops > 0 ? GOLD : GOLD_IDLE}
          strokeWidth={0.6}
          strokeDasharray="1.4 1.2"
          markerEnd="url(#gbr-arrow)"
        />
        <defs>
          <marker id="gbr-arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill={hops > 0 ? GOLD : GOLD_IDLE} />
          </marker>
        </defs>

        {/* ---- nodes ---- */}
        {NODES.map((n) => {
          const st = status(n.id);
          const ms = msOf(trace, n.id);
          const isSel = selected === n.id;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(n.id)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={1.6}
                fill={FILL[st]}
                stroke={isSel ? "#1d4ed8" : STROKE[st]}
                strokeWidth={isSel ? 0.9 : st === "running" ? 0.7 : 0.5}
                className={st === "running" ? "gbr-pulse" : undefined}
              />
              <text
                x={cx(n)}
                y={ms !== null ? cy(n) - 0.2 : cy(n) + 1.1}
                textAnchor="middle"
                style={{ fontSize: 3, fontWeight: st === "idle" ? 400 : 600, fill: INK[st] }}
              >
                {n.label}
              </text>
              {ms !== null && (
                <text
                  x={cx(n)}
                  y={cy(n) + 3}
                  textAnchor="middle"
                  style={{ fontSize: 2.3, fill: "#94a3b8" }}
                  className="font-mono"
                >
                  {ms} ms{n.id === "hop" && hops > 0 ? ` · ×${hops}` : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* hover explanation, anchored to the node */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-20 w-56 rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-600 shadow-lg"
          style={{
            left: `${cx(hovered)}%`,
            top: `${cy(hovered) < 20 ? cy(hovered) + hovered.h : cy(hovered) - hovered.h}%`,
            transform: `translate(-50%, ${cy(hovered) < 20 ? "8px" : "calc(-100% - 8px)"})`,
          }}
        >
          <span className="mb-0.5 block font-medium text-slate-900">{hovered.label}</span>
          {STAGE_ROLE[hovered.id][level]}
        </div>
      )}

      {/* legend */}
      <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border border-slate-300 bg-white" /> waiting
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border border-blue-700 bg-blue-100" /> running
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border border-slate-800 bg-slate-100" /> done
        </span>
      </div>
    </div>
  );
}
