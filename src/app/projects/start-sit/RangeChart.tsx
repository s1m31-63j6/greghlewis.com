/**
 * Every selected player on one points axis: a band from the 20th to the 80th
 * percentile of the simulated game, a tick at the median, a filled mark at the
 * expected value. Each row is drawn in the player's team color; the recommended
 * starter gets a full-strength band and an ink outline on his mark. Direct
 * labels only: the name on the left, the band's ends beside it.
 */

import type { SimResult } from "@/lib/start-sit/simulate";
import type { Player } from "@/lib/start-sit/types";
import { pts } from "./format";

const ROW = 30;

export function RangeChart({
  rows, best, tied, compact = false,
}: {
  rows: { player: Player; mean: number; sim: SimResult; color: string }[];
  best: string | null;
  tied: string[];
  /** Phone geometry: a narrower drawing so the type stays legible when scaled. */
  compact?: boolean;
}) {
  if (!rows.length) return null;
  const W = compact ? 340 : 560;
  const PAD_L = compact ? 84 : 118;
  const PAD_R = compact ? 36 : 44;
  const hi = Math.max(...rows.map((r) => r.sim.p80), 1);
  const max = Math.ceil((hi + 2) / 5) * 5;
  const x = (v: number) => PAD_L + (v / max) * (W - PAD_L - PAD_R);
  const H = rows.length * ROW + 26;
  const ticks = [];
  for (let t = 0; t <= max; t += max > 30 ? 10 : 5) ticks.push(t);

  return (
    <figure className="ss-range">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={rows.map((r) => `${r.player.short}: ${pts(r.sim.p20)} to ${pts(r.sim.p80)}, expected ${pts(r.mean)}`).join("; ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={4} y2={H - 22} className="ss-range-grid" />
            <text x={x(t)} y={H - 8} className="ss-range-tick">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = i * ROW + 16;
          const state = r.player.id === best ? "best" : tied.includes(r.player.id) ? "tied" : "rest";
          return (
            <g key={r.player.id} className={`ss-range-row is-${state}`} style={{ ["--team-color" as string]: r.color }}>
              <text x={PAD_L - 10} y={y + 4} className="ss-range-name">{r.player.short}</text>
              <rect x={x(r.sim.p20)} y={y - 6} width={Math.max(2, x(r.sim.p80) - x(r.sim.p20))} height={12} rx={2} className="ss-range-band" />
              <line x1={x(r.sim.p50)} x2={x(r.sim.p50)} y1={y - 8} y2={y + 8} className="ss-range-median" />
              <circle cx={x(r.mean)} cy={y} r={4} className="ss-range-mean" />
              {x(r.sim.p80) - x(r.sim.p20) < 30 ? (
                // A band too narrow to sit between two labels gets one label.
                <text x={x(r.sim.p80) + 8} y={y + 4} className="ss-range-end">{pts(r.sim.p20)} – {pts(r.sim.p80)}</text>
              ) : (
                <>
                  <text x={x(r.sim.p20) - 5} y={y + 4} className="ss-range-end ss-range-end--lo">{pts(r.sim.p20)}</text>
                  <text x={x(r.sim.p80) + 5} y={y + 4} className="ss-range-end">{pts(r.sim.p80)}</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="ss-range-cap">
        Band is the 20th to 80th percentile of a simulated game; the dot is the expected total, the tick the median.
      </figcaption>
    </figure>
  );
}
