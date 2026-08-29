"use client";

import { memo } from "react";

import type { Adp, BoardKey, PlatformKey, Player } from "@/lib/draft-sheet/types";
import { InjuryTag } from "./InjuryTag";
import { PlatformCells } from "./PlatformCells";
import { Trend } from "./Trend";
import { TeamLogo, type TeamMap } from "./teams";

/**
 * One line of the board. Deliberately a grid rather than a table row: the sheet
 * is several independent position columns side by side, and a table would force
 * them into a shared column geometry they do not want.
 */
export const PlayerRow = memo(function PlayerRow({
  player, adp, board, teams, platforms, starred, removed, last,
  onStar, onRemove, onOpen,
}: {
  player: Player;
  adp: Adp | undefined;
  board: BoardKey;
  teams: TeamMap;
  platforms: PlatformKey[];
  starred: boolean;
  removed: boolean;
  /** The final player in a tier — the difference between reach now and wait. */
  last: boolean;
  onStar: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const ecr = player.ecr[board];
  // The column header already says the position, so "WR12" spends six pixels
  // repeating it — and "DST13" and three-digit ranks overflowed the cell.
  const rankNum = (player.posRank[board] ?? "").replace(/^[A-Z]+/, "");

  return (
    <div
      className={`ds-row${starred ? " is-starred" : ""}${removed ? " is-removed" : ""}${last ? " is-last" : ""}`}
      style={{ ["--team-color" as string]: teams[player.team ?? ""]?.color ?? "transparent" }}
    >
      <button
        type="button"
        className="ds-star"
        aria-pressed={starred}
        aria-label={`${starred ? "Unstar" : "Star"} ${player.name}`}
        onClick={() => onStar(player.id)}
        data-tel="ds-star"
      >
        <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
          <path d="M5 0.6 6.3 3.6 9.5 3.9 7.1 6 7.8 9.2 5 7.5 2.2 9.2 2.9 6 0.5 3.9 3.7 3.6Z" />
        </svg>
      </button>

      <span className="ds-rank ds-num" title={player.posRank[board] ?? undefined}>
        {rankNum || "—"}
      </span>

      <button
        type="button"
        className="ds-name"
        title={`${player.name} — open the player note`}
        onClick={() => onOpen(player.id)}
        data-tel="ds-open-player"
      >
        {player.short}
      </button>

      <InjuryTag injury={player.injury} />

      <span className="ds-teamcell">
        <TeamLogo abbr={player.team} teams={teams} size={13} />
        <span className="ds-bye ds-num">{player.bye ?? "—"}</span>
      </span>

      <span className="ds-ecr ds-num" title="Expert consensus rank — the anchor every cell is measured against">
        {ecr != null ? Math.round(ecr) : "—"}
      </span>

      <PlatformCells player={player} adp={adp} board={board} visible={platforms} />

      <Trend move={adp?.move} />

      <button
        type="button"
        className="ds-remove"
        aria-label={`${removed ? "Restore" : "Remove"} ${player.name}`}
        onClick={() => onRemove(player.id)}
        data-tel="ds-remove"
      >
        {removed ? "+" : "×"}
      </button>
    </div>
  );
});
