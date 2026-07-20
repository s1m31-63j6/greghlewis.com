"use client";

import { useState } from "react";

import ablation from "@/lib/glass-box-rag/ablation.json";

/**
 * The ablation results. These are measured against a 19-question golden set with
 * case-level ground truth — including the results that argue against the design.
 *
 * Displayed as bars rather than a chart library: with ten configurations and four
 * metrics, a sorted bar list is easier to read than a grouped chart, and it avoids
 * pulling Plotly into this route.
 */

interface Row {
  label: string;
  critical_recall: number;
  recall: number;
  precision: number;
  mrr: number;
  violations: number;
}
interface Ablation {
  top_k: number;
  n_questions: number;
  results: Row[];
}

const DATA = ablation as Ablation;

const METRICS = [
  {
    key: "critical_recall" as const,
    label: "Critical recall",
    blurb:
      "Fraction of must-have cases retrieved. The headline metric: missing the case that cuts the other way makes an answer wrong, not merely thin.",
  },
  { key: "recall" as const, label: "Recall", blurb: "Fraction of all relevant cases retrieved." },
  {
    key: "precision" as const,
    label: "Precision",
    blurb: "Fraction of retrieved cases that were relevant.",
  },
  { key: "mrr" as const, label: "MRR", blurb: "How highly the first relevant case ranks." },
];

export function EvaluationTab() {
  const [metric, setMetric] = useState<(typeof METRICS)[number]>(METRICS[0]);
  const rows = [...DATA.results].sort((a, b) => b[metric.key] - a[metric.key]);
  const max = Math.max(...rows.map((r) => r[metric.key]));

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              m.key === metric.key
                ? "bg-stone-900 text-white"
                : "border border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] italic text-stone-500">{metric.blurb}</p>

      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-52 shrink-0 truncate font-mono text-stone-600" title={r.label}>
              {r.label}
            </span>
            <span className="relative h-3 flex-1 rounded-sm bg-stone-100">
              <span
                className="absolute inset-y-0 left-0 rounded-sm bg-stone-800"
                style={{ width: `${(r[metric.key] / max) * 100}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-stone-700">
              {r[metric.key].toFixed(3)}
            </span>
            <span
              className={`w-4 shrink-0 text-right font-mono ${
                r.violations ? "text-amber-700" : "text-emerald-700"
              }`}
              title={`${r.violations} anachronistic citation${r.violations === 1 ? "" : "s"}`}
            >
              {r.violations ? "⚠" : "✓"}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-2 text-[11px] text-stone-600">
        <p>
          <strong className="text-stone-800">BM25 beats dense retrieval here</strong> (0.895 vs
          0.789). Legal writing is dense with exact terms of art, which lexical matching handles
          well — and this corpus is small enough that semantic bridging has little room to help.
        </p>
        <p>
          <strong className="text-stone-800">Diversification is the biggest single win</strong>{" "}
          (0.868 → 0.921). Without a per-case cap, one long opinion crowds out the case that
          disagrees with it.
        </p>
        <p>
          <strong className="text-stone-800">Only the temporal filter fixes anachronism.</strong>{" "}
          Every other configuration cites a 2023 decision when asked what the law was in 2015.
        </p>
        <p className="text-stone-500">
          {DATA.n_questions} questions, top-{DATA.top_k}. Differences under ~0.05 are within
          noise at this sample size — a 0.026 gap is roughly one question changing.
        </p>
      </div>
    </div>
  );
}
