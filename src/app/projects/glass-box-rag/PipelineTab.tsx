"use client";

import { useState } from "react";

import type { RankedDoc } from "@/lib/glass-box-rag/types";
import type { StageRun, Trace } from "./useGlassBoxRag";

/**
 * The pipeline trace. Every row is a stage that actually ran, with its real
 * timing and its real output — clicking one opens the intermediate artifact.
 *
 * The interesting moment is the rank churn: the same passages get ordered three
 * different ways by three different mechanisms (fusion, cross-encoder, per-case
 * cap), and the arrows show each document's movement against the prior stage.
 */

const STAGE_COPY: Record<string, string> = {
  analyze: "Claude reads the question — what is being asked, and is it scoped to a past moment?",
  transform: "Drafts a hypothetical judicial passage to use as a retrieval probe (HyDE).",
  retrieve_sparse: "BM25 over the corpus — exact legal terms of art.",
  retrieve_dense: "Vector similarity — meaning rather than wording.",
  fuse: "Reciprocal Rank Fusion combines both lists by rank, not score.",
  temporal: "Drops opinions that did not exist yet.",
  rerank: "A cross-encoder rescores each passage against the question.",
  diversify: "Caps passages per case so one long opinion cannot crowd out the rest.",
  assess: "Claude decides: enough to answer, or follow a citation?",
  hop: "Follows a citation edge to a precedent not yet retrieved.",
  synthesize: "Writes the answer, grounded only in what was retrieved.",
};

function Movement({ doc, index }: { doc: RankedDoc; index: number }) {
  if (doc.prev_rank === undefined) return <span className="text-stone-300">·</span>;
  const delta = doc.prev_rank - index;
  if (delta === 0) return <span className="text-stone-300">–</span>;
  const up = delta > 0;
  return (
    <span className={up ? "text-emerald-600" : "text-stone-400"}>
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
          <span className="w-5 shrink-0 text-right font-mono text-stone-400">{i + 1}</span>
          <span className="w-7 shrink-0 font-mono">
            <Movement doc={d} index={i} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-stone-800">{d.case_name}</span>{" "}
            <span className="text-stone-400">
              ({d.court}, {d.year})
            </span>
            {d.section && <span className="text-stone-400"> · {d.section}</span>}
            <span className="block truncate text-stone-500">{d.snippet}</span>
          </span>
          <span className="shrink-0 font-mono text-stone-400">{d.score.toFixed(3)}</span>
        </li>
      ))}
    </ol>
  );
}

function StageRow({ run, trace }: { run: StageRun; trace: Trace }) {
  const [open, setOpen] = useState(false);
  const caseCount = run.docs ? new Set(run.docs.map((d) => d.case_id)).size : null;

  return (
    <li className="border-b border-stone-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2 text-left hover:bg-stone-50"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            run.running ? "animate-pulse bg-stone-900" : "bg-stone-300"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="text-[13px] text-stone-800">{run.label}</span>
          {run.docs && (
            <span className="ml-2 text-[11px] text-stone-400">
              {run.docs.length} passages
              {caseCount !== null && ` · ${caseCount} cases`}
            </span>
          )}
          {run.detail?.dropped ? (
            <span className="ml-2 text-[11px] text-amber-700">
              dropped {String(run.detail.dropped)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-stone-400">
          {run.ms !== undefined ? `${run.ms}ms` : "…"}
        </span>
      </button>

      {open && (
        <div className="pb-3 pl-4 pr-1">
          <p className="text-[11px] italic text-stone-500">{STAGE_COPY[run.stage]}</p>

          {run.stage === "analyze" && trace.analysis && (
            <dl className="mt-2 space-y-1 text-[11px]">
              <div>
                <dt className="inline text-stone-400">intent: </dt>
                <dd className="inline text-stone-700">{trace.analysis.intent}</dd>
              </div>
              <div>
                <dt className="inline text-stone-400">as of: </dt>
                <dd className="inline text-stone-700">{trace.analysis.as_of ?? "no temporal limit"}</dd>
              </div>
              <div>
                <dt className="inline text-stone-400">factors: </dt>
                <dd className="inline text-stone-700">{trace.analysis.factors.join(", ")}</dd>
              </div>
              <p className="text-stone-500">{trace.analysis.reasoning}</p>
            </dl>
          )}

          {run.stage === "transform" && trace.transform && (
            <div className="mt-2 text-[11px]">
              <p className="text-stone-400">Hypothetical passage used as the probe:</p>
              <p className="mt-1 border-l-2 border-stone-200 pl-2 italic text-stone-600">
                {trace.transform.hyde}
              </p>
              {trace.transform.variants.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-stone-500">
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
                  <p className={a.sufficient ? "text-emerald-700" : "text-amber-700"}>
                    {a.sufficient ? "Sufficient — stopping." : "Not sufficient — following a citation."}
                  </p>
                  <p className="mt-1 text-stone-600">{a.reasoning}</p>
                  {a.follow.map((f) => (
                    <p key={f.case_id} className="mt-1 text-stone-500">
                      → {f.case_name}: {f.why}
                    </p>
                  ))}
                </div>
              ))}

          {run.docs && run.docs.length > 0 && <DocList docs={run.docs} />}
        </div>
      )}
    </li>
  );
}

export function PipelineTab({ trace }: { trace: Trace | null }) {
  if (!trace) {
    return (
      <p className="p-4 text-[13px] text-stone-500">
        Ask a question and each retrieval stage will appear here as it runs — with its real
        timing and its real output. Click any stage to inspect what it produced.
      </p>
    );
  }

  const hops = [...new Set(trace.stages.map((s) => s.hop))].sort((a, b) => a - b);

  return (
    <div className="p-3">
      {hops.map((hop) => (
        <section key={hop} className="mb-3">
          {hops.length > 1 && (
            <h3 className="mb-1 text-[10px] uppercase tracking-wider text-stone-400">
              {hop === 0 ? "Initial retrieval" : `Hop ${hop} — following a citation`}
            </h3>
          )}
          <ul>
            {trace.stages
              .filter((s) => s.hop === hop)
              .map((s) => (
                <StageRow key={s.key} run={s} trace={trace} />
              ))}
          </ul>
        </section>
      ))}

      {trace.meta && (
        <p className="mt-2 border-t border-stone-100 pt-2 font-mono text-[11px] text-stone-400">
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
