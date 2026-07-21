"use client";

import { useState } from "react";

import type { RankedDoc, StageName } from "@/lib/glass-box-rag/types";
import { COPY, STAGE_ROLE, useLevel } from "./copy";
import { PipelineDiagram } from "./PipelineDiagram";
import type { StageRun, Trace } from "./useGlassBoxRag";

/**
 * The pipeline tab. A live diagram of the whole route sits on top (see
 * PipelineDiagram); below it, the stage that's selected in the diagram opens to
 * reveal its real intermediate artifact.
 *
 * The interesting moment is the rank churn: the same passages get ordered three
 * different ways by three different mechanisms (fusion, cross-encoder, per-case
 * cap), and the arrows show each document's movement against the prior stage.
 */

function Movement({ doc, index }: { doc: RankedDoc; index: number }) {
  if (doc.prev_rank === undefined) return <span className="text-slate-300">·</span>;
  const delta = doc.prev_rank - index;
  if (delta === 0) return <span className="text-slate-300">–</span>;
  const up = delta > 0;
  return (
    <span className={up ? "text-emerald-600" : "text-slate-400"}>
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

function DocList({ docs }: { docs: RankedDoc[] }) {
  return (
    <ol className="mt-2 space-y-1">
      {docs.map((d, i) => (
        <li key={d.chunk_id} className="flex gap-2 text-[11px] leading-snug">
          <span className="w-5 shrink-0 text-right font-mono text-slate-400">{i + 1}</span>
          <span className="w-7 shrink-0 font-mono">
            <Movement doc={d} index={i} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-slate-800">{d.case_name}</span>{" "}
            <span className="text-slate-400">
              ({d.court}, {d.year})
            </span>
            {d.section && <span className="text-slate-400"> · {d.section}</span>}
            <span className="block truncate text-slate-500">{d.snippet}</span>
          </span>
          <span className="shrink-0 font-mono text-slate-400">{d.score.toFixed(3)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The expanded artifact for one stage run. */
function StageDetail({ run, trace, level }: { run: StageRun; trace: Trace; level: "grad" | "eli5" }) {
  const caseCount = run.docs ? new Set(run.docs.map((d) => d.case_id)).size : null;
  return (
    <div className="border-l-2 border-slate-200 pb-3 pl-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-slate-800">{run.label}</span>
        <span className="font-mono text-[11px] text-slate-400">
          {run.ms !== undefined ? `${run.ms} ms` : run.running ? "running…" : ""}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] italic text-slate-500">{STAGE_ROLE[run.stage]?.[level]}</p>

      {run.docs && (
        <p className="mt-1 text-[11px] text-slate-400">
          {run.docs.length} passages{caseCount !== null && ` · ${caseCount} cases`}
          {run.detail?.dropped ? (
            <span className="ml-2 text-yellow-700">dropped {String(run.detail.dropped)}</span>
          ) : null}
        </p>
      )}

      {run.stage === "analyze" && trace.analysis && (
        <dl className="mt-2 space-y-1 text-[11px]">
          <div>
            <dt className="inline text-slate-400">intent: </dt>
            <dd className="inline text-slate-700">{trace.analysis.intent}</dd>
          </div>
          <div>
            <dt className="inline text-slate-400">as of: </dt>
            <dd className="inline text-slate-700">
              {trace.analysis.as_of ?? "no temporal limit"}
            </dd>
          </div>
          <div>
            <dt className="inline text-slate-400">factors: </dt>
            <dd className="inline text-slate-700">{trace.analysis.factors.join(", ")}</dd>
          </div>
          <p className="text-slate-500">{trace.analysis.reasoning}</p>
        </dl>
      )}

      {run.stage === "transform" && trace.transform && (
        <div className="mt-2 text-[11px]">
          <p className="text-slate-400">Hypothetical passage used as the probe:</p>
          <p className="mt-1 border-l-2 border-slate-200 pl-2 italic text-slate-600">
            {trace.transform.hyde}
          </p>
          {trace.transform.variants.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-slate-500">
              {trace.transform.variants.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {run.stage === "assess" &&
        trace.assessments
          .filter((a) => a.hop === run.hop)
          .map((a) => (
            <div key={a.hop} className="mt-2 text-[11px]">
              <p className={a.sufficient ? "text-emerald-700" : "text-yellow-700"}>
                {a.sufficient
                  ? "Sufficient — stopping."
                  : "Not sufficient — following a citation."}
              </p>
              <p className="mt-1 text-slate-600">{a.reasoning}</p>
              {a.follow.map((f) => (
                <p key={f.case_id} className="mt-1 text-slate-500">
                  → {f.case_name}: {f.why}
                </p>
              ))}
            </div>
          ))}

      {run.docs && run.docs.length > 0 && <DocList docs={run.docs} />}
    </div>
  );
}

export function PipelineTab({ trace }: { trace: Trace | null }) {
  const level = useLevel();
  const [selected, setSelected] = useState<StageName | null>(null);

  if (!trace) {
    return <p className="p-4 text-[13px] text-slate-500">{COPY.pipelineEmpty[level]}</p>;
  }

  // Every run of the selected stage (a stage can run once per hop).
  const selectedRuns = selected
    ? trace.stages.filter((s) => s.stage === selected).sort((a, b) => a.hop - b.hop)
    : [];

  return (
    <div className="p-3">
      <PipelineDiagram trace={trace} selected={selected} onSelect={setSelected} />

      <div className="mt-3 border-t border-slate-100 pt-3">
        {selectedRuns.length > 0 ? (
          <div className="space-y-3">
            {selectedRuns.map((run) =>
              trace.stages.filter((s) => s.stage === selected).length > 1 ? (
                <div key={run.key}>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">
                    {run.hop === 0 ? "Initial retrieval" : `Hop ${run.hop}`}
                  </p>
                  <StageDetail run={run} trace={trace} level={level} />
                </div>
              ) : (
                <StageDetail key={run.key} run={run} trace={trace} level={level} />
              ),
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">
            Click any node above to inspect what that stage produced — the passages it returned and
            how their order changed.
          </p>
        )}
      </div>

      {trace.meta && (
        <p className="mt-3 border-t border-slate-100 pt-2 font-mono text-[11px] text-slate-400">
          {(trace.meta.total_ms / 1000).toFixed(1)}s total · {trace.meta.hops} hop
          {trace.meta.hops === 1 ? "" : "s"}
          {trace.meta.input_tokens
            ? ` · ${trace.meta.input_tokens.toLocaleString()} in / ${trace.meta.output_tokens?.toLocaleString()} out`
            : ""}
        </p>
      )}
    </div>
  );
}
