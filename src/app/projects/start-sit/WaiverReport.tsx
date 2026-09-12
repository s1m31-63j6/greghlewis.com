"use client";

/**
 * Best available on waivers, as a pop-out over the advisor.
 *
 * One input, the Sleeper league id (the long number in the league's URL). The
 * report is every priced player nobody in that league holds, ranked by
 * expected points for the page's scoring, eight per position. "Compare" drops
 * a player into the advisor and closes the report.
 *
 * Dialog behaviour follows the career-paths brief: Escape and the backdrop
 * close it, focus lands on the close button when it opens and returns to the
 * trigger when it closes, and the page behind it does not scroll.
 */

import { useEffect, useRef, useState } from "react";

import type { Game, Player, Position, Scoring } from "@/lib/start-sit/types";
import { REC_OPTIONS } from "@/lib/start-sit/types";
import type { WaiverReport as Report } from "@/lib/start-sit/waivers";
import { loadWaivers, looksLikeLeagueId } from "@/lib/start-sit/waivers";
import { Headshot } from "./Headshot";
import { InjuryTag } from "./InjuryTag";
import { COVERAGE_LABEL, kickoffLabel, matchup, pts, teamTotal } from "./format";
import type { TeamMap } from "./teams";
import { TeamLogo, teamOf } from "./teams";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; report: Report; leagueId: string };

/** The report body, kept presentational so the render gate can exercise it. */
export function WaiverList({
  report, scoring, games, teams, picked, onCompare,
}: {
  report: Report;
  scoring: Scoring;
  games: Map<string, Game>;
  teams: TeamMap;
  picked: Set<string>;
  onCompare: (id: string) => void;
}) {
  const recLabel = REC_OPTIONS.find((o) => o.value === scoring.rec)?.label ?? "";
  const leagueRec = report.league.rec;
  const differs = leagueRec != null && leagueRec !== scoring.rec;
  return (
    <div className="ss-waivers">
      <p className="ss-waivers-lede">
        <strong>{report.league.name}</strong> · {report.league.teams} teams · {report.rosteredCount} players
        rostered. Ranked for {recLabel.toLowerCase()} scoring, the page setting.
        {differs && ` Your league scores ${leagueRec} per reception; switch the control above to match it.`}
      </p>
      <div className="ss-waiver-grid">
        {POSITIONS.map((pos) => (
          <section key={pos} className={`ss-waiver-col ss-pos-${pos}`} aria-label={`Available ${pos}s`}>
            <h3 className="ss-waiver-head">{pos}</h3>
            <ol className="ss-waiver-list">
              {report.byPos[pos].map((r) => {
                const p = r.player;
                const tag = COVERAGE_LABEL[p.coverage];
                const total = teamTotal(p, games);
                return (
                  <li key={p.id} className="ss-waiver-row" style={{ ["--team-color" as string]: teamOf(teams, p.team).color }}>
                    <Headshot name={p.name} espnId={p.espnId} fallbackUrl={null} team={p.team} teams={teams} size={30} />
                    <div className="ss-waiver-id">
                      <span className="ss-waiver-name">{p.name}<InjuryTag injury={p.injury} /></span>
                      <span className="ss-waiver-meta">
                        <TeamLogo abbr={p.team} teams={teams} size={12} /> {p.team} · {matchup(p)} · {kickoffLabel(p.kickoff)}
                        {total != null && <> · total {total.toFixed(1)}</>}
                        {tag && <span className="ss-cov">{tag}</span>}
                      </span>
                    </div>
                    <div className="ss-waiver-pts">
                      <span className="ss-num ss-waiver-mean">{pts(r.mean)}</span>
                      <span className="ss-num ss-waiver-band">{pts(r.p20)} – {pts(r.p80)}</span>
                    </div>
                    <button type="button" className="ss-row-add" disabled={picked.has(p.id)}
                      onClick={() => onCompare(p.id)} data-tel="ss-waiver-add" aria-label={`Compare ${p.name}`}>
                      <span className="ss-row-add-long">{picked.has(p.id) ? "Added" : "Compare"}</span>
                      <span className="ss-row-add-short" aria-hidden="true">{picked.has(p.id) ? "✓" : "+"}</span>
                    </button>
                  </li>
                );
              })}
              {report.byPos[pos].length === 0 && <li className="ss-waiver-none">Nobody priced is unrostered.</li>}
            </ol>
          </section>
        ))}
      </div>
      <p className="ss-waivers-foot">
        &ldquo;Available&rdquo; means on no roster in this league as of now. Waiver order, claims and who is
        droppable are the league&rsquo;s business, and the lines do not know your bye-week needs.
      </p>
    </div>
  );
}

export function WaiverReport({
  open, onClose, returnFocusTo, players, games, teams, scoring, picked, leagueId, onLeagueId, onCompare,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
  players: Player[];
  games: Map<string, Game>;
  teams: TeamMap;
  scoring: Scoring;
  picked: Set<string>;
  leagueId: string;
  onLeagueId: (id: string) => void;
  onCompare: (id: string) => void;
}) {
  const [q, setQ] = useState(leagueId);
  const [state, setState] = useState<State>({ kind: "idle" });
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const trigger = returnFocusTo.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      trigger?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const id = q.trim();
    if (!looksLikeLeagueId(id)) {
      setState({ kind: "error", message: "That is not a league id. Open your league on Sleeper and copy the long number from the address bar." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const report = await loadWaivers(id, players, scoring);
      onLeagueId(id);
      setState({ kind: "done", report, leagueId: id });
    } catch {
      setState({ kind: "error", message: "Sleeper did not return a league for that id. Check the number and that the league is public." });
    }
  };

  if (!open) return null;
  return (
    <div className="ss-modal-backdrop" onClick={onClose}>
      <div className="ss-modal" role="dialog" aria-modal="true" aria-labelledby="ss-waivers-title" onClick={(e) => e.stopPropagation()}>
        <header className="ss-modal-head">
          <div>
            <p className="ss-kicker">Sleeper league</p>
            <h2 id="ss-waivers-title">Best available on waivers</h2>
          </div>
          <button ref={closeBtn} type="button" className="ss-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form className="ss-waivers-form" onSubmit={submit}>
          <label htmlFor="ss-league-id">Sleeper league id</label>
          <div className="ss-waivers-row">
            <input id="ss-league-id" className="ss-slot-input" inputMode="numeric" autoComplete="off"
              placeholder="The long number in your league's URL" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="ss-btn ss-btn-primary" disabled={state.kind === "loading"} data-tel="ss-waivers-load">
              {state.kind === "loading" ? "Loading…" : "Load"}
            </button>
          </div>
          <p className="ss-waivers-hint">
            Nothing is sent anywhere but Sleeper: the league is read straight from their public API in your browser.
          </p>
        </form>
        {state.kind === "error" && <p className="ss-waivers-error">{state.message}</p>}
        {state.kind === "done" && (
          <WaiverList report={state.report} scoring={scoring} games={games} teams={teams} picked={picked} onCompare={onCompare} />
        )}
      </div>
    </div>
  );
}
