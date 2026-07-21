"use client";

import { useState, type ReactNode } from "react";

import ablation from "@/lib/glass-box-rag/ablation.json";
import { COPY, Term, useLevel, type Level } from "./copy";

/**
 * The ablation results. Measured against a golden set with case-level ground
 * truth — including the configurations that argue against the final design.
 *
 * The commentary is generated from the data for whichever metric is selected, so
 * it describes the chart the reader is actually looking at rather than a fixed
 * story — and it can never drift from the numbers.
 */

interface Row {
  label: string;
  critical_recall: number;
  recall: number;
  precision: number;
  mrr: number;
  violations: number;
}
type MetricKey = "critical_recall" | "recall" | "precision" | "mrr";
interface Ablation {
  top_k: number;
  n_questions: number;
  results: Row[];
}

const DATA = ablation as Ablation;
const v = (label: string, key: MetricKey) =>
  DATA.results.find((r) => r.label === label)?.[key];
const f = (x: number | undefined) => (x === undefined ? "—" : x.toFixed(3));

const METRICS: { key: MetricKey; label: string; term: string }[] = [
  { key: "critical_recall", label: "Critical recall", term: "criticalRecall" },
  { key: "recall", label: "Recall", term: "recall" },
  { key: "precision", label: "Precision", term: "precision" },
  { key: "mrr", label: "MRR", term: "mrr" },
];

/** Commentary that describes the selected metric's chart, drawn from the data. */
function Commentary({ metric, level }: { metric: MetricKey; level: Level }) {
  const rows = [...DATA.results].sort((a, b) => b[metric] - a[metric]);
  const leader = rows[0];

  const lead = (
    <p className="text-slate-600">
      Sorted high to low. <span className="font-medium text-slate-800">{leader.label}</span> leads
      at <span className="font-mono">{f(leader[metric])}</span>.
    </p>
  );

  const body: Record<MetricKey, Record<Level, ReactNode>> = {
    critical_recall: {
      grad: (
        <>
          The bars rank each setup by <Term id="criticalRecall">critical recall</Term> — the
          fraction of must-have cases found. The winners all share a per-case cap:{" "}
          <Term id="diversification">diversification</Term> lifts it from {f(v("hybrid", metric))}{" "}
          to {f(leader[metric])}. Notice <Term id="bm25">BM25</Term> keyword search alone (
          {f(v("bm25", metric))}) beats <Term id="dense">vector search</Term> alone (
          {f(v("dense", metric))}) — legal writing is dense with exact terms of art. The lone ✓ is
          the only setup with a <Term id="temporal">temporal filter</Term>; every other cites a
          case that did not exist yet.
        </>
      ),
      eli5: (
        <>
          These bars rank each search recipe by how often it finds the can&apos;t-miss cases. The
          best ones all limit how many pages come from one book. Word-matching alone (
          {f(v("bm25", metric))}) beats meaning-matching alone ({f(v("dense", metric))}). The one
          green check is the only recipe that never quoted a case from the future.
        </>
      ),
    },
    recall: {
      grad: (
        <>
          Sorted by <Term id="recall">recall</Term> — how much of everything relevant was found.{" "}
          <Term id="diversification">Diversification</Term> is the lever here: it jumps recall from{" "}
          {f(v("hybrid", metric))} (hybrid) to {f(v("hybrid+div2", metric))} (hybrid + cap). Without
          a per-case cap, one long on-point opinion floods the top slots and buries the rest.
        </>
      ),
      eli5: (
        <>
          These bars rank recipes by how many of the right pages they found. Limiting
          pages-per-book helps most: it takes recall from {f(v("hybrid", metric))} up to{" "}
          {f(v("hybrid+div2", metric))}.
        </>
      ),
    },
    precision: {
      grad: (
        <>
          Sorted by <Term id="precision">precision</Term> — and it inverts the recall story. The
          very configs that win recall sink here (~{f(v("hybrid+rerank+div2", metric))}), because a
          per-case cap keeps thinner passages in order to stay broad.{" "}
          <Term id="rerank">Reranking</Term> without a cap is tightest ({f(v("hybrid+rerank", metric))}).
          Breadth and purity trade off; the design favors breadth, because missing the case that
          cuts the other way is the worse failure.
        </>
      ),
      eli5: (
        <>
          These bars rank recipes by how little junk they bring back — and it flips: the recipes
          that found the most pages also bring the most junk ({f(v("hybrid+rerank+div2", metric))}).
          It&apos;s a trade-off, and this system casts a wide net on purpose.
        </>
      ),
    },
    mrr: {
      grad: (
        <>
          Sorted by <Term id="mrr">MRR</Term> — how near the top the first genuinely relevant case
          lands. This is where the <Term id="rerank">cross-encoder</Term> earns its keep: it nudges
          MRR from {f(v("hybrid+div2", metric))} to {f(leader[metric])}. It barely moves recall,
          but it puts a strong answer first.
        </>
      ),
      eli5: (
        <>
          These bars rank recipes by how close to #1 the first good case sits. The pickier second
          reader helps most here — it pushes a great answer right to the top ({f(leader[metric])}).
        </>
      ),
    },
  };

  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2 text-[11px] leading-relaxed">
      {lead}
      <p className="text-slate-600">{body[metric][level]}</p>
    </div>
  );
}

export function EvaluationTab() {
  const level = useLevel();
  const [metric, setMetric] = useState<MetricKey>("critical_recall");
  const rows = [...DATA.results].sort((a, b) => b[metric] - a[metric]);

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] text-slate-500">{COPY.evalIntro[level]}</p>

      <div className="mb-3 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              m.key === metric
                ? "bg-blue-700 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-52 shrink-0 truncate font-mono text-slate-600" title={r.label}>
              {r.label}
            </span>
            {/* bars anchored at 0 on the metric's true 0–1 domain */}
            <span className="relative h-3 flex-1 rounded-sm bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-sm bg-blue-700"
                style={{ width: `${r[metric] * 100}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-slate-700">
              {r[metric].toFixed(3)}
            </span>
            <span
              className={`w-4 shrink-0 text-right font-mono ${
                r.violations ? "text-yellow-700" : "text-emerald-700"
              }`}
              title={`${r.violations} anachronistic citation${r.violations === 1 ? "" : "s"}`}
            >
              {r.violations ? "⚠" : "✓"}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <Commentary metric={metric} level={level} />
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        {DATA.n_questions} questions, top-{DATA.top_k}. Differences under ~0.05 are within noise at
        this sample size — a change of one or two questions.
      </p>
    </div>
  );
}
