/**
 * The week's board: every priced player ranked by expected points, with the
 * same simulated band the advisor shows, at fewer draws.
 */

import { components } from "./scoring.ts";
import { simulate } from "./simulate.ts";
import type { Player, Position, Scoring } from "./types.ts";

export interface BoardRow {
  player: Player;
  mean: number;
  p20: number;
  p80: number;
}

export function rankBoard(players: Player[], scoring: Scoring, pos: Position, draws = 1000): BoardRow[] {
  const priced = players.filter((p) => p.pos === pos && Object.keys(p.stats).length > 0);
  const sim = simulate(priced, scoring, { draws });
  return priced
    .map((player, i) => ({
      player,
      mean: components(player, scoring).mean,
      p20: sim.results[i].p20,
      p80: sim.results[i].p80,
    }))
    .sort((a, b) => b.mean - a.mean);
}
