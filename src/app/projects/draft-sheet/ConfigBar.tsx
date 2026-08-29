"use client";

import { useState } from "react";

import {
  LEAGUE_TOGGLES, SCORING_PRESETS, TEAM_COUNTS, activeScoring,
} from "@/lib/draft-sheet/presets";
import type { LeagueConfig, Position } from "@/lib/draft-sheet/types";
import { ImportLeague } from "./ImportLeague";

const SLOTS: { key: keyof LeagueConfig["roster"]; label: string; max: number }[] = [
  { key: "QB", label: "QB", max: 2 },
  { key: "RB", label: "RB", max: 4 },
  { key: "WR", label: "WR", max: 5 },
  { key: "TE", label: "TE", max: 3 },
  { key: "FLEX", label: "FLEX", max: 3 },
  { key: "SUPERFLEX", label: "SFLX", max: 1 },
  { key: "K", label: "K", max: 1 },
  { key: "DST", label: "DST", max: 1 },
  { key: "BENCH", label: "BENCH", max: 12 },
];

function summarise(c: LeagueConfig): string {
  const r = c.roster;
  const ppr = c.scoring.rec === 1 ? "Full PPR" : c.scoring.rec === 0 ? "Standard" : "Half PPR";
  const slots = (["QB", "RB", "WR", "TE"] as Position[])
    .map((p) => `${r[p]}${p}`)
    .join("/");
  const extra = [
    r.FLEX ? `${r.FLEX} FLEX` : null,
    r.SUPERFLEX ? "superflex" : null,
    c.scoring.teRecBonus ? "TE premium" : null,
    c.scoring.passTd === 6 ? "6pt pass TD" : null,
  ].filter(Boolean);
  return `${c.teams} team · ${ppr} · ${slots}${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
}

export function ConfigBar({
  config, setConfig, setRoster, setScoring, departure, boardLabel,
}: {
  config: LeagueConfig;
  setConfig: (c: LeagueConfig) => void;
  setRoster: (p: Partial<LeagueConfig["roster"]>) => void;
  setScoring: (p: Partial<LeagueConfig["scoring"]>) => void;
  departure: number;
  boardLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ds-configbar">
      <div className="ds-configbar-main">
        <div className="ds-control-group" role="group" aria-label="Scoring">
          <span className="ds-control-label">Scoring</span>
          <div className="ds-seg">
            {SCORING_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ds-seg-btn"
                aria-pressed={activeScoring(config) === p.id}
                title={p.hint}
                onClick={() =>
                  setConfig({ ...config, scoring: { ...config.scoring, rec: p.rec } })
                }
                data-tel="ds-preset"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ds-control-group" role="group" aria-label="League options">
          <span className="ds-control-label">League</span>
          <div className="ds-toggles">
            {LEAGUE_TOGGLES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="ds-toggle"
                aria-pressed={t.isOn(config)}
                title={t.hint}
                onClick={() => setConfig(t.toggle(config))}
                data-tel="ds-toggle"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <p className="ds-summary">{summarise(config)}</p>

        <button
          type="button"
          className="ds-btn ds-btn-ghost"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          data-tel="ds-settings"
        >
          {open ? "Hide settings" : "Settings"}
        </button>
      </div>

      {/*
        Say plainly which published board this snapped to and how far the league
        pulled away from it. Somebody in an exotic league deserves to know they
        are further from consensus than somebody in a standard one — that is the
        most interesting thing this panel can tell them.
      */}
      <p className="ds-provenance">
        Built on the <strong>{boardLabel}</strong> expert consensus board.{" "}
        {departure === 0
          ? "Your settings match what that board assumes, so this is consensus, unedited."
          : `Your roster shifts positions against each other by up to ${Math.round(departure)} places. Order within each position is untouched.`}
      </p>

      {open && (
        <div className="ds-panel">
          <ImportLeague onImport={setConfig} />
          <div className="ds-field">
            <label htmlFor="ds-teams">Teams</label>
            <select
              id="ds-teams"
              value={config.teams}
              onChange={(e) => setConfig({ ...config, teams: Number(e.target.value) })}
            >
              {TEAM_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="ds-field">
            <label htmlFor="ds-rec">Per reception</label>
            <select
              id="ds-rec"
              value={config.scoring.rec}
              onChange={(e) => setScoring({ rec: Number(e.target.value) })}
            >
              <option value={0}>0 — standard</option>
              <option value={0.5}>0.5 — half PPR</option>
              <option value={1}>1 — full PPR</option>
            </select>
          </div>

          <div className="ds-field">
            <label htmlFor="ds-td">Passing TD</label>
            <select
              id="ds-td"
              value={config.scoring.passTd}
              onChange={(e) => setScoring({ passTd: Number(e.target.value) })}
            >
              <option value={4}>4 points</option>
              <option value={6}>6 points</option>
            </select>
          </div>

          <div className="ds-field">
            <label htmlFor="ds-tep">TE bonus</label>
            <select
              id="ds-tep"
              value={config.scoring.teRecBonus}
              onChange={(e) => setScoring({ teRecBonus: Number(e.target.value) })}
            >
              <option value={0}>None</option>
              <option value={0.5}>+0.5 per catch</option>
              <option value={1}>+1 per catch</option>
            </select>
          </div>

          <div className="ds-slots">
            {SLOTS.map((s) => (
              <div key={s.key} className="ds-slot">
                <label htmlFor={`ds-slot-${s.key}`}>{s.label}</label>
                <input
                  id={`ds-slot-${s.key}`}
                  type="number"
                  min={0}
                  max={s.max}
                  value={config.roster[s.key]}
                  onChange={(e) => setRoster({ [s.key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
