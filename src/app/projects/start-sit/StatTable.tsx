/**
 * The lines behind the number. One row per market: the posted line, the
 * expected value once the lean is applied, how many books posted it, and
 * which tier it came from. A pick'em row says so.
 */

import { firmness, tdFirmness } from "@/lib/start-sit/conviction";
import type { Firmness } from "@/lib/start-sit/conviction";
import type { Breakdown } from "@/lib/start-sit/scoring";
import type { Player, StatKey } from "@/lib/start-sit/types";
import { STAT_LABEL } from "@/lib/start-sit/types";
import { pct } from "./format";

function Market({ f }: { f: Firmness }) {
  if (f.kind === "pickem") return <span className="ss-mkt ss-mkt--pickem">pick&rsquo;em</span>;
  const books = `${f.books} book${f.books === 1 ? "" : "s"}`;
  if (f.kind === "moving" && f.move != null) {
    const up = f.move > 0;
    return (
      <span className={`ss-mkt ss-mkt--moving ${up ? "is-up" : "is-down"}`} title={`Moved ${up ? "up" : "down"} ${Math.abs(f.move).toFixed(1)} since the line opened`}>
        {books} <span className="ss-mkt-arrow" aria-hidden="true">{up ? "▲" : "▼"}</span>
        <span className="ss-sr">moved {up ? "up" : "down"}</span>{Math.abs(f.move).toFixed(1)}
      </span>
    );
  }
  return <span className={`ss-mkt ss-mkt--${f.kind}`}>{books} · {f.kind}</span>;
}

export function StatTable({ player, breakdown }: { player: Player; breakdown: Breakdown }) {
  return (
    <table className="ss-stats">
      <thead>
        <tr>
          <th scope="col">Market</th>
          <th scope="col" className="ss-num">Line</th>
          <th scope="col" className="ss-num">Implied</th>
          <th scope="col" className="ss-num">Pts</th>
          <th scope="col">Market</th>
        </tr>
      </thead>
      <tbody>
        {breakdown.parts.map((c) => {
          const td = c.key === "td" ? player.stats.td : null;
          const line = c.key === "td" ? null : player.stats[c.key];
          return (
            <tr key={c.key} className={c.tier === "dfs" ? "is-dfs" : undefined}>
              <th scope="row">{c.label}</th>
              <td className="ss-num">{td ? `${pct(td.p)} to score` : line?.line.toFixed(1)}</td>
              <td className="ss-num">{td ? `${td.lambda.toFixed(2)} TD` : c.value.toFixed(1)}</td>
              <td className="ss-num">{c.points === 0 ? "—" : c.points.toFixed(1)}</td>
              <td className="ss-src">
                <Market f={td ? tdFirmness(td) : firmness(c.key as StatKey, line!)} />
              </td>
            </tr>
          );
        })}
        {breakdown.missing.map((k) => (
          <tr key={k} className="is-missing">
            <th scope="row">{STAT_LABEL[k]}</th>
            <td colSpan={4}>no line posted</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
