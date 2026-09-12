"use client";

/**
 * The slots. Two by default, up to six. Each slot is a search box until a
 * player is chosen, then a chip with his face and a remove button.
 *
 * The search results show the coverage tag before the player is picked, so
 * "no line" is visible at the moment of choosing rather than after.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { Player } from "@/lib/start-sit/types";
import { MAX_PICKS } from "@/lib/start-sit/types";
import { Headshot } from "./Headshot";
import { COVERAGE_LABEL } from "./format";
import type { TeamMap } from "./teams";
import { TeamLogo, teamOf } from "./teams";

const RESULTS = 10;

function Slot({
  index, player, players, teams, taken, onPick, onClear,
}: {
  index: number;
  player: Player | null;
  players: Player[];
  teams: TeamMap;
  taken: Set<string>;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // An empty box lists the week's top players so the first click shows names;
  // typing narrows the same list.
  const browsing = q.trim() === "";
  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return players
      .filter((p) => !taken.has(p.id))
      .filter((p) => words.length > 0 || (p.game && p.coverage !== "played" && p.coverage !== "none"))
      .filter((p) => {
        const hay = `${p.name} ${p.team} ${p.pos}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, RESULTS);
  }, [q, players, taken]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (player) {
    const tag = COVERAGE_LABEL[player.coverage];
    return (
      <div className="ss-slot ss-slot--filled" style={{ ["--team-color" as string]: teamOf(teams, player.team).color }}>
        <Headshot name={player.name} espnId={player.espnId} fallbackUrl={null} team={player.team} teams={teams} size={30} />
        <div className="ss-slot-id">
          <span className="ss-slot-name">{player.name}</span>
          <span className="ss-slot-meta">
            <span className={`ss-pos ss-pos-${player.pos}`}>{player.pos}</span>
            <TeamLogo abbr={player.team} teams={teams} size={12} />
            {player.team}
            {tag && <span className="ss-cov">{tag}</span>}
          </span>
        </div>
        <button type="button" className="ss-slot-clear" onClick={onClear} aria-label={`Remove ${player.name}`} data-tel="ss-remove">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="ss-slot" ref={box}>
      <label className="ss-slot-label" htmlFor={`ss-pick-${index}`}>Player {index + 1}</label>
      <input
        id={`ss-pick-${index}`}
        className="ss-slot-input"
        type="search"
        autoComplete="off"
        placeholder="Type a name, team or position"
        value={q}
        onChange={(e) => { setQ(e.target.value); setCursor(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(matches.length - 1, c + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
          if (e.key === "Enter" && matches[cursor]) { onPick(matches[cursor].id); setQ(""); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`ss-list-${index}`}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
        <ul className="ss-results" id={`ss-list-${index}`} role="listbox">
          {browsing && <li className="ss-results-head" role="presentation">Top players this week</li>}
          {matches.map((p, i) => {
            const tag = COVERAGE_LABEL[p.coverage];
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={i === cursor}
                className={`ss-result${i === cursor ? " is-active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); onPick(p.id); setQ(""); setOpen(false); }}
                onMouseEnter={() => setCursor(i)}
                data-tel="ss-pick"
              >
                <Headshot name={p.name} espnId={p.espnId} fallbackUrl={null} team={p.team} teams={teams} size={24} />
                <span className="ss-result-name">{p.name}</span>
                <span className="ss-result-meta">
                  <span className={`ss-pos ss-pos-${p.pos}`}>{p.pos}</span> {p.team}
                </span>
                {tag && <span className="ss-cov">{tag}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PlayerPicker({
  picks, players, byId, teams, onChange,
}: {
  picks: (string | null)[];
  players: Player[];
  byId: Map<string, Player>;
  teams: TeamMap;
  onChange: (picks: (string | null)[]) => void;
}) {
  const taken = new Set(picks.filter((x): x is string => !!x));
  return (
    <div className="ss-picker" data-tour="picker">
      {picks.map((id, i) => (
        <Slot
          key={i}
          index={i}
          player={id ? byId.get(id) ?? null : null}
          players={players}
          teams={teams}
          taken={taken}
          onPick={(pid) => onChange(picks.map((x, j) => (j === i ? pid : x)))}
          onClear={() => {
            const next = picks.map((x, j) => (j === i ? null : x));
            // Never below two slots; an emptied third slot goes away.
            onChange(next.length > 2 ? next.filter((x, j) => x !== null || j < 2) : next);
          }}
        />
      ))}
      {picks.length < MAX_PICKS && (
        <button
          type="button"
          className="ss-add"
          onClick={() => onChange([...picks, null])}
          data-tel="ss-add"
        >
          + Add a player
        </button>
      )}
    </div>
  );
}
