"use client";

// The main reporting surface. Centerpiece of the page — large Plotly
// chart + sortable/filterable table + narrative prose + collapsed SQL.
// Drives off a single ChatTurn; streams update progressively as SSE
// events flow in.

import { useMemo } from "react";
import Plot from "./Plot";
import { SortableTable } from "./SortableTable";
import type { ChatTurn } from "@/lib/adventureworks/types";

interface Props {
  turn: ChatTurn | null;
  streaming: boolean;
}

const STAGES: { label: string; matches: (status: string) => boolean }[] = [
  { label: "Generating SQL", matches: (s) => s.toLowerCase().includes("sql") },
  { label: "Running query", matches: (s) => s.toLowerCase().includes("query") },
  { label: "Summarising", matches: (s) => s.toLowerCase().includes("summar") },
];

export function ResultPanel({ turn, streaming }: Props) {
  const layoutWithDefaults = useMemo(() => {
    if (!turn?.chart?.layout) return null;
    return {
      autosize: true,
      ...(turn.chart.layout as Record<string, unknown>),
    };
  }, [turn?.chart]);

  if (!turn) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-6 py-20 text-center">
        <p className="text-stone-600 text-[15px]">
          Ask the warehouse a question. The model translates it to T-SQL,
          runs it against AdventureWorksDW, and renders the result here as
          a chart, a sortable table, and a sentence or two of prose.
        </p>
        <p className="text-stone-500 text-[12px] mt-2">
          First query after idle takes ~20-30s while the serverless database
          wakes up.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-5">
      {/* Question echo */}
      <div className="text-[10px] uppercase tracking-wider text-stone-500">
        Question
      </div>
      <p className="text-[15px] text-stone-900 -mt-3 font-medium">
        {turn.question || turn.content}
      </p>

      {/* Streaming progress */}
      {streaming && !turn.errored && (
        <StageProgress status={turn.status} hasSql={!!turn.sql} hasRows={!!turn.table} hasNarrative={!!turn.content} />
      )}

      {/* Error */}
      {turn.errored && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium">Something went wrong.</div>
          <div className="text-amber-800 text-[13px] mt-1">{turn.errored}</div>
        </div>
      )}

      {/* Narrative */}
      {turn.content && !turn.errored && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">
            Headline
          </div>
          <p className="text-stone-900 text-[15px] leading-relaxed">{turn.content}</p>
        </div>
      )}

      {/* Chart */}
      {turn.chart && Array.isArray(turn.chart.data) && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">
            Chart
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-2">
            <Plot
              data={turn.chart.data as Plotly.Data[]}
              layout={
                {
                  ...(layoutWithDefaults ?? {}),
                  autosize: true,
                  height: 400,
                } as Plotly.Layout
              }
              config={{
                displaylogo: false,
                modeBarButtonsToRemove: [
                  "lasso2d",
                  "select2d",
                  "autoScale2d",
                  "toggleSpikelines",
                ],
                responsive: true,
              }}
              useResizeHandler
              style={{ width: "100%", height: 400 }}
            />
          </div>
        </div>
      )}

      {/* Table */}
      {turn.table && turn.table.columns.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">
            Result rows
          </div>
          <SortableTable
            columns={turn.table.columns}
            rows={turn.table.rows}
            totalRows={turn.table.row_count}
          />
        </div>
      )}

      {/* SQL expander */}
      {turn.sql && (
        <details className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[13px]">
          <summary className="cursor-pointer text-stone-500 select-none">
            Generated T-SQL
          </summary>
          <pre className="mt-2 overflow-x-auto text-[12px] text-stone-700 whitespace-pre-wrap">
            {turn.sql}
          </pre>
          {turn.validation && !turn.validation.ok && (
            <div className="mt-2 text-[12px] text-amber-800">
              Validation issue: {turn.validation.errors?.join("; ")}
            </div>
          )}
        </details>
      )}

      {/* Meta chip */}
      {turn.meta && (
        <div className="text-[11px] font-mono text-stone-500 flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-stone-100">
          <span>{turn.meta.model_id}</span>
          <span>{(turn.meta.latency_ms / 1000).toFixed(1)}s</span>
          <span>
            {turn.meta.prompt_tokens.toLocaleString()} in /{" "}
            {turn.meta.completion_tokens.toLocaleString()} out
          </span>
          <span>${turn.meta.cost_est_usd.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}

function StageProgress({
  status,
  hasSql,
  hasRows,
  hasNarrative,
}: {
  status: string | undefined;
  hasSql: boolean;
  hasRows: boolean;
  hasNarrative: boolean;
}) {
  const activeIdx = (() => {
    if (hasNarrative) return 3;
    if (hasRows) return 2;
    if (hasSql) return 1;
    return 0;
  })();
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="flex items-center gap-3">
        {STAGES.map((s, i) => {
          const done = i < activeIdx;
          const cur = i === activeIdx;
          return (
            <div
              key={s.label}
              className={`flex items-center gap-1.5 text-[12px] ${
                done ? "text-stone-500" : cur ? "text-stone-900" : "text-stone-400"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                  done
                    ? "bg-stone-300 text-stone-700"
                    : cur
                      ? "bg-stone-900 text-white animate-pulse"
                      : "border border-stone-300"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>
      {status && <div className="text-[11px] text-stone-500 italic mt-1">{status}</div>}
    </div>
  );
}
