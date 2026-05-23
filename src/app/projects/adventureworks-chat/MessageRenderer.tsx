"use client";

// Renders one assistant turn: status banner → narrative prose → SQL
// expander → result table → Vega-Lite chart → model_meta chip →
// "Launch live Power BI" button.

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ChatTurn, ChartSpec } from "@/lib/adventureworks/types";

// react-vega imports vega at runtime — keep it client-only to avoid SSR
// "window is not defined" failures.
const VegaLite = dynamic(
  () => import("react-vega").then((m) => m.VegaLite),
  { ssr: false, loading: () => <div className="h-48" /> },
);

interface Props {
  turn: ChatTurn;
  streaming: boolean;
  onLaunchDashboard: () => void;
}

export function MessageRenderer({ turn, streaming, onLaunchDashboard }: Props) {
  const enrichedChart = useEnrichedChartSpec(turn.chart);

  return (
    <div className="space-y-3">
      {streaming && turn.status && !turn.errored && (
        <div className="text-xs text-stone-500 italic">
          {turn.status}
          <span className="inline-block ml-1 animate-pulse">…</span>
        </div>
      )}

      {turn.errored ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium">Something went wrong.</div>
          <div className="text-amber-800 text-[13px] mt-1">{turn.errored}</div>
        </div>
      ) : (
        <>
          {turn.content && (
            <p className="text-[15px] leading-relaxed text-stone-900">
              {turn.content}
            </p>
          )}
          {turn.table && turn.table.rows.length > 0 && (
            <ResultTable
              columns={turn.table.columns}
              rows={turn.table.rows}
              rowCount={turn.table.row_count}
            />
          )}
          {enrichedChart && (
            <div className="rounded-lg border border-stone-200 bg-white p-3">
              <VegaLite
                spec={enrichedChart as Record<string, unknown>}
                actions={false}
                style={{ width: "100%" }}
              />
            </div>
          )}
          {turn.sql && (
            <details className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[13px]">
              <summary className="cursor-pointer text-stone-500 select-none">
                Show the SQL
              </summary>
              <pre className="mt-2 overflow-x-auto text-[12px] text-stone-700 whitespace-pre-wrap">
                {turn.sql}
              </pre>
            </details>
          )}
          {turn.validation && !turn.validation.ok && (
            <div className="text-[12px] text-amber-800">
              Validation warnings: {turn.validation.errors?.join("; ")}
            </div>
          )}
          {turn.table &&
            turn.table.rows.length > 0 &&
            process.env.NEXT_PUBLIC_ADVENTUREWORKS_PBI_ENABLED === "true" && (
              <div>
                <button
                  type="button"
                  onClick={onLaunchDashboard}
                  className="text-[12px] px-3 py-1.5 rounded-full border border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:text-stone-900 transition"
                >
                  View as Power BI dashboard ↗
                </button>
              </div>
            )}
        </>
      )}

      {turn.meta && (
        <div className="text-[11px] font-mono text-stone-500 flex flex-wrap gap-x-3">
          <span>{turn.meta.model_id}</span>
          <span>{(turn.meta.latency_ms / 1000).toFixed(1)}s</span>
          <span>
            {turn.meta.prompt_tokens.toLocaleString()}/
            {turn.meta.completion_tokens.toLocaleString()} tok
          </span>
          <span>${turn.meta.cost_est_usd.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}

function ResultTable({
  columns,
  rows,
  rowCount,
}: {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}) {
  const shown = rows.slice(0, 100);
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2 font-medium text-stone-700 whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr
              key={i}
              className={i % 2 === 0 ? "bg-white" : "bg-stone-50/50"}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-stone-900 whitespace-nowrap">
                  {formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(rowCount > shown.length || rows.length > shown.length) && (
        <div className="px-3 py-1.5 text-[11px] text-stone-500 border-t border-stone-200 bg-stone-50">
          Showing {shown.length} of {rowCount.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function useEnrichedChartSpec(spec: ChartSpec | undefined): ChartSpec | undefined {
  return useMemo(() => {
    if (!spec) return undefined;
    // Ensure $schema is set; force width to container if not specified.
    const enriched: ChartSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: "container",
      ...spec,
    };
    return enriched;
  }, [spec]);
}
