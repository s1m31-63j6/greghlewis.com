/**
 * The lines behind the number. One row per market: the posted line, the
 * expected value once the lean is applied, how many books posted it, and
 * which tier it came from. A pick'em row says so.
 */

import type { Breakdown } from "@/lib/start-sit/scoring";
import type { Player } from "@/lib/start-sit/types";
import { STAT_LABEL } from "@/lib/start-sit/types";
import { pct } from "./format";

export function StatTable({ player, breakdown }: { player: Player; breakdown: Breakdown }) {
  return (
    <table className="ss-stats">
      <thead>
        <tr>
          <th scope="col">Market</th>
          <th scope="col" className="ss-num">Line</th>
          <th scope="col" className="ss-num">Implied</th>
          <th scope="col" className="ss-num">Pts</th>
          <th scope="col">Source</th>
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
                {c.tier === "book" ? `${c.books} book${c.books === 1 ? "" : "s"}` : "pick'em"}
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
