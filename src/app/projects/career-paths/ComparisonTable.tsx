"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import type { FundingRow, StageRow } from "@/lib/career-paths/brief";

// Both wide tables on the brief tab. First column is the row's name and
// reads bold; the header row is mono uppercase via .cp-table. Each column
// carries a minimum width so ten columns wrap their prose instead of
// forcing a sideways scroll at the container width.

const FUNDING_COLS: { key: keyof FundingRow; label: string; min: number }[] = [
  { key: "model", label: "Model", min: 118 },
  { key: "owner", label: "Who owns it", min: 88 },
  { key: "wants", label: "What they want", min: 88 },
  { key: "horizon", label: "Horizon", min: 88 },
  { key: "cashPay", label: "Cash pay", min: 88 },
  { key: "equity", label: "Equity", min: 88 },
  { key: "liquidity", label: "Liquidity", min: 88 },
  { key: "jobRisk", label: "Job risk", min: 88 },
  { key: "goodOutcome", label: "Good outcome", min: 88 },
  { key: "experience", label: "What it feels like as an employee", min: 200 },
];

const STAGE_COLS: { key: keyof StageRow; label: string; min: number }[] = [
  { key: "stage", label: "Stage", min: 118 },
  { key: "roundSize", label: "Round size", min: 104 },
  { key: "postMoney", label: "Post-money", min: 104 },
  { key: "headcount", label: "Headcount", min: 96 },
  { key: "newGradGrant", label: "New-grad grant", min: 120 },
  { key: "cashVsMarket", label: "Cash vs market", min: 120 },
  { key: "nextStageOdds", label: "Odds of next stage", min: 140 },
];

/**
 * A horizontally scrolling table wrapper that shows a fade and a mono
 * "scroll →" hint while there is more table to the right, and drops both
 * once the reader reaches the end or the table fits.
 */
export function ScrollTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollWidth - el.clientWidth > 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className={`cp-table-shell ${className}`} data-overflow={overflow} data-at-end={atEnd}>
      {overflow && <div className="cp-table-hint" aria-hidden="true">scroll →</div>}
      <div className="cp-table-wrap" ref={ref} onScroll={measure}>
        {children}
      </div>
    </div>
  );
}

function Table<T extends object>({ cols, rows, caption }: {
  cols: { key: keyof T; label: string; min: number }[];
  rows: T[];
  caption: string;
}) {
  return (
    <ScrollTable className="cp-brief-table-wrap cp-brief-wide">
      <table className="cp-table cp-brief-table">
        <caption className="cp-kicker">{caption}</caption>
        <thead>
          <tr>{cols.map((c) => <th key={String(c.key)} style={{ minWidth: c.min }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c, j) => (
                j === 0
                  ? <th scope="row" key={String(c.key)}>{String(r[c.key])}</th>
                  : <td key={String(c.key)}>{String(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

export function FundingTable({ rows }: { rows: FundingRow[] }) {
  return <Table cols={FUNDING_COLS} rows={rows} caption="Twelve funding models, what each asks of the company" />;
}

export function StageTable({ rows }: { rows: StageRow[] }) {
  return <Table cols={STAGE_COLS} rows={rows} caption="The stage ladder, pre-seed to public" />;
}
