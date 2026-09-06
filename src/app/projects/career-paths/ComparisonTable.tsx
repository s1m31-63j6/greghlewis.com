import type { FundingRow, StageRow } from "@/lib/career-paths/brief";

// Both wide tables on the brief tab. First column is the row's name and
// reads bold; the header row is mono uppercase via .cp-table.

const FUNDING_COLS: { key: keyof FundingRow; label: string }[] = [
  { key: "model", label: "Model" },
  { key: "owner", label: "Who owns it" },
  { key: "wants", label: "What they want" },
  { key: "horizon", label: "Horizon" },
  { key: "cashPay", label: "Cash pay" },
  { key: "equity", label: "Equity" },
  { key: "liquidity", label: "Liquidity" },
  { key: "jobRisk", label: "Job risk" },
  { key: "goodOutcome", label: "Good outcome" },
];

const STAGE_COLS: { key: keyof StageRow; label: string }[] = [
  { key: "stage", label: "Stage" },
  { key: "roundSize", label: "Round size" },
  { key: "postMoney", label: "Post-money" },
  { key: "headcount", label: "Headcount" },
  { key: "newGradGrant", label: "New-grad grant" },
  { key: "cashVsMarket", label: "Cash vs market" },
  { key: "nextStageOdds", label: "Odds of next stage" },
];

function Table<T extends object>({ cols, rows, caption }: {
  cols: { key: keyof T; label: string }[];
  rows: T[];
  caption: string;
}) {
  return (
    <div className="cp-table-wrap cp-brief-table-wrap">
      <table className="cp-table cp-brief-table">
        <caption className="cp-kicker">{caption}</caption>
        <thead>
          <tr>{cols.map((c) => <th key={String(c.key)}>{c.label}</th>)}</tr>
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
    </div>
  );
}

export function FundingTable({ rows }: { rows: FundingRow[] }) {
  return <Table cols={FUNDING_COLS} rows={rows} caption="Twelve funding models, what each asks of the company" />;
}

export function StageTable({ rows }: { rows: StageRow[] }) {
  return <Table cols={STAGE_COLS} rows={rows} caption="The stage ladder, pre-seed to public" />;
}
