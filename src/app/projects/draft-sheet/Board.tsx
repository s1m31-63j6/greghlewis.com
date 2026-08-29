"use client";

/**
 * The board: one column per position, each a stack of tiers.
 *
 * Tiers are delineated by a BRACKET in the left gutter plus a weighted rule —
 * not background tints (invisible at 4%, a gray smear at 10% on a photocopier)
 * and not per-tier color (it runs out of distinguishable hues past four, and
 * quarterbacks alone have sixteen).
 *
 * The bracket's LENGTH encodes tier size, and tier size is the actual decision
 * variable at a draft: "six left in this tier, I can take a receiver and come
 * back" is the single most useful thought the board can produce, and a bracket
 * answers it pre-attentively without anyone counting rows.
 */

import type {
  Adp, BuiltBoard, PlatformKey, Player, Position, SheetPrefs,
} from "@/lib/draft-sheet/types";
import { PLATFORMS } from "@/lib/draft-sheet/types";
import { PlayerRow } from "./PlayerRow";
import type { TeamMap } from "./teams";

const POS_LABEL: Record<Position, string> = {
  QB: "Quarterbacks", RB: "Running backs", WR: "Receivers",
  TE: "Tight ends", K: "Kickers", DST: "Defenses",
};

export function Board({
  built, adp, teams, platforms, prefs, onStar, onRemove, onOpen, showRemoved,
}: {
  built: BuiltBoard;
  adp: Map<string, Adp>;
  teams: TeamMap;
  platforms: PlatformKey[];
  prefs: SheetPrefs;
  onStar: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  showRemoved: boolean;
}) {
  const starred = new Set(prefs.starred);
  const removed = new Set(prefs.removed);

  return (
    // The row grid has one cell per visible platform, so unchecking a platform
    // hands its width straight back to the player name.
    <div className="ds-board" style={{ ["--cells" as string]: platforms.length }}>
      {built.columns.map((col) => (
        <section key={col.pos} className="ds-col" aria-label={POS_LABEL[col.pos]}>
          <header className={`ds-col-head ds-pos-${col.pos}`}>
            <h2>{col.pos}</h2>
            <span className="ds-col-meta">
              {col.tiers.reduce((n, t) => n + t.players.length, 0)} shown
              <span className="ds-col-repl" title="Where this position stops producing starters in your league">
                · replacement {col.replacement}
              </span>
            </span>
          </header>

          {/* Without this the cells are four anonymous numbers. The header row
              reuses the row grid so the labels sit exactly over their columns,
              however many platforms are showing. */}
          <div className="ds-colkey" aria-hidden="true">
            <span /><span /><span /><span /><span />
            <span className="ds-colkey-ecr">ECR</span>
            {platforms.map((key) => {
              const spec = PLATFORMS.find((p) => p.key === key)!;
              return (
                <span key={key} className="ds-colkey-plat">
                  {spec.short}
                  {spec.kind === "rank" && <sup>*</sup>}
                </span>
              );
            })}
            <span className="ds-colkey-trend">30d</span>
            <span />
          </div>

          {col.tiers.map((tier) => (
            <div
              key={tier.tier}
              className={`ds-tier${tier.fromConsensus ? "" : " is-derived"}`}
            >
              <div className="ds-tier-bracket" aria-hidden="true">
                <span className="ds-tier-num">{tier.tier}</span>
              </div>
              <div className="ds-tier-rows">
                {tier.players
                  .filter((p: Player) => showRemoved || !removed.has(p.id))
                  .map((p, i, arr) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      adp={adp.get(p.id)}
                      board={built.board}
                      teams={teams}
                      platforms={platforms}
                      starred={starred.has(p.id)}
                      removed={removed.has(p.id)}
                      last={i === arr.length - 1 && arr.length > 1}
                      onStar={onStar}
                      onRemove={onRemove}
                      onOpen={onOpen}
                    />
                  ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
