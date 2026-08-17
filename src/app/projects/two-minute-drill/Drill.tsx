"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import "./styles.css";
import DecisionPanel from "./DecisionPanel";
import Field from "./Field";
import GameReview from "./GameReview";
import Scoreboard from "./Scoreboard";
import ScenarioPicker from "./ScenarioPicker";
import { FG_SNAP_OVERHEAD } from "./engine/engine";
import { narrate } from "./narrate";
import {
  formatClock, loadIndex, ROUND_NAME, scoreAt, type Scenario, type ScenarioIndex,
} from "./scenarios";
import { TeamLogo, teamOf, useTeams } from "./teams";
import { useDrill } from "./useDrill";

/**
 * Field goal probability straight from the shipped surface, so the field and
 * the call sheet can quote a number without waking the worker for it.
 */
function useFgCurve(season: number) {
  const [fg, setFg] = useState<{ lo: number; bySeason: Record<string, number[]> } | null>(null);
  const [onside, setOnside] = useState(0.075);
  useEffect(() => {
    fetch("/two-minute-drill/distributions.json")
      .then((r) => r.json())
      .then((d) => {
        setFg({ lo: d.field_goal.grid_lo, bySeason: d.field_goal.make_by_season });
        setOnside(d.kickoff.onside.recover);
      })
      .catch(() => undefined);
  }, []);
  const seasons = fg ? Object.keys(fg.bySeason).map(Number).sort((a, b) => a - b) : [];
  const at = (distance: number, forSeason = season): number | null => {
    if (!fg) return null;
    const arr = fg.bySeason[String(forSeason)];
    if (!arr) return null;
    const i = distance - fg.lo;
    return i >= 0 && i < arr.length ? arr[i] : null;
  };
  return { at, onside, seasons };
}

export default function Drill() {
  const [index, setIndex] = useState<ScenarioIndex | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [userTeam, setUserTeam] = useState<string | null>(null);
  const [season, setSeason] = useState(2025);
  const [reveal, setReveal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const teams = useTeams();

  useEffect(() => {
    loadIndex().then(setIndex).catch((e: Error) => setLoadError(e.message));
  }, []);

  const drill = useDrill(scenario, userTeam, season);
  const fg = useFgCurve(season);

  const opponent = useMemo(() => {
    if (!scenario || !userTeam) return "";
    return userTeam === scenario.home ? scenario.away : scenario.home;
  }, [scenario, userTeam]);

  const score = useMemo(
    () => (scenario && drill.state && userTeam ? scoreAt(scenario, drill.state, userTeam) : null),
    [scenario, drill.state, userTeam],
  );

  const fgProb = drill.state ? fg.at(drill.state.yardline + FG_SNAP_OVERHEAD) : null;

  // What the same kick was worth in the selected season against 2025, so the
  // slider shows its effect on the kick actually in front of you.
  const kickComparison = useMemo(() => {
    if (!drill.state) return null;
    const distance = drill.state.yardline + FG_SNAP_OVERHEAD;
    const then = fg.at(distance, season);
    const now = fg.at(distance, 2025);
    if (then === null || now === null || distance > 68) return null;
    return { distance, then, now };
  }, [drill.state, fg, season]);

  /**
   * Where the ball has been this possession, and where it sat before the last
   * play. Walking the decisions backwards until possession flips or a score
   * lands is what keeps the trail to the current drive rather than the game.
   */
  const { trail, previousYardline, scoredBy } = useMemo(() => {
    const ds = drill.decisions;
    if (!ds.length || !drill.state) {
      return {
        trail: [] as number[],
        previousYardline: null as number | null,
        scoredBy: null as "user" | "opponent" | null,
      };
    }
    const last = ds[ds.length - 1];
    const spots: number[] = [];
    for (let i = ds.length - 1; i >= 0; i -= 1) {
      const d = ds[i];
      if (d.before.offenseIsUser !== drill.state.offenseIsUser) break;
      if (d.before.phase !== "play") break;
      spots.unshift(d.before.yardline);
    }
    return {
      trail: spots,
      previousYardline:
        last.before.offenseIsUser === drill.state.offenseIsUser ? last.before.yardline : null,
      // Which end zone to pulse. The scorer is whoever had the ball, which on
      // a defensive snap is the other team.
      scoredBy:
        last.outcome === "touchdown" || last.outcome === "fg_good"
          ? last.before.offenseIsUser
            ? ("user" as const)
            : ("opponent" as const)
          : null,
    };
  }, [drill.decisions, drill.state]);

  const back = (
    <nav className="tmd-nav">
      <Link href="/">← All projects</Link>
      {scenario && (
        <>
          <span className="tmd-nav-sep">/</span>
          <button
            onClick={() => {
              setScenario(null);
              setUserTeam(null);
              drill.reset();
            }}
          >
            Pick another scenario
          </button>
        </>
      )}
      <span className="tmd-nav-sep">/</span>
      <Link href="/projects/two-minute-drill/methodology">Methodology</Link>
    </nav>
  );

  // -- scenario selection --------------------------------------------------

  if (!scenario || !userTeam) {
    return (
      <main className="tmd-page">
        <div className="tmd-container">
          {back}
          <header className="tmd-masthead">
            <h1>Two-Minute Drill</h1>
            <p className="tmd-standfirst">
              Three hundred real NFL games, picked up with under two minutes left and the score
              inside one possession. Take either sideline and make the calls. While your calls
              match the ones that were actually made, the real game plays out; the moment you
              choose differently, a simulator takes over and you own everything that follows.
            </p>
          </header>
          {loadError && <p className="tmd-note">Could not load the scenarios: {loadError}</p>}
          {!index && !loadError && <p className="tmd-note">Loading scenarios…</p>}
          {index && (
            <ScenarioPicker
              scenarios={index.scenarios}
              teams={teams}
              onPick={(s, team) => {
                setScenario(s);
                setUserTeam(team);
                drill.reset();
              }}
            />
          )}
        </div>
      </main>
    );
  }

  // -- playing -------------------------------------------------------------

  const { state, side, evals, decisions, thinking, over, error, currentReal, diverged } = drill;
  const userResult = state ? (state.offenseIsUser ? state.diff : -state.diff) : 0;
  const user = teamOf(teams, userTeam);

  return (
    <main className="tmd-page" style={{ ["--user-color" as string]: user.color }}>
      <div className="tmd-container">
        {back}

        <header className="tmd-gamehead">
          <div className="tmd-gamehead-marks">
            <TeamLogo abbr={scenario.away} teams={teams} size={44} />
            <TeamLogo abbr={scenario.home} teams={teams} size={44} />
          </div>
          <div>
            <h1 className="tmd-gamehead-title">
              {teamOf(teams, scenario.away).nick || scenario.away} at{" "}
              {teamOf(teams, scenario.home).nick || scenario.home}
            </h1>
            <div className="tmd-gamehead-meta">
              {scenario.round === "REG"
                ? `${scenario.season} week ${scenario.week}`
                : `${scenario.season} ${ROUND_NAME[scenario.round]}`}{" "}
              · you are the {user.nick || userTeam}
              {state && !over && <> · {formatClock(state.seconds)} to play</>}
            </div>
          </div>
        </header>

        {error && <p className="tmd-note">Engine trouble: {error}</p>}

        {state && score && (
          <>
            <Scoreboard
              state={state}
              userTeam={userTeam}
              opponent={opponent}
              score={score}
              teams={teams}
            />
            <Field
              state={state}
              previousYardline={previousYardline}
              trail={trail}
              playIndex={decisions.length}
              fgProbability={fgProb}
              userTeam={userTeam}
              opponent={opponent}
              teams={teams}
              scoredBy={scoredBy}
            />
          </>
        )}

        {over && state ? (
          <GameReview
            decisions={decisions}
            sequence={drill.sequence}
            userTeam={userTeam}
            opponent={opponent}
            teams={teams}
            won={userResult > 0 ? 1 : userResult < 0 ? 0 : 0.5}
            onReplay={() => drill.reset()}
            onPick={() => {
              setScenario(null);
              setUserTeam(null);
              drill.reset();
            }}
          />
        ) : (
          <div className="tmd-columns">
            {state && (
              <DecisionPanel
                state={state}
                side={side}
                evals={evals}
                thinking={thinking}
                reveal={reveal}
                onDecide={drill.decide}
                fgProbability={fgProb}
                onsideRate={fg.onside}
                opponent={opponent}
                userTeam={userTeam}
                currentReal={currentReal}
              >
                <button className="tmd-btn" onClick={drill.undo} disabled={!decisions.length}>
                  Take it back
                </button>
                <button className="tmd-btn" onClick={drill.reset} disabled={!decisions.length}>
                  Restart
                </button>
              </DecisionPanel>
            )}

            <div>
              <div className="tmd-panel">
                <div className="tmd-panel-head">
                  <span>drive log</span>
                  <span>{diverged ? "simulated" : "as it happened"}</span>
                </div>
                <div className="tmd-panel-body tmd-log">
                  {!decisions.length && (
                    <p className="tmd-note">
                      {currentReal
                        ? "Your calls are being checked against the ones actually made. Match them and the real game plays out."
                        : "Make a call to start."}
                    </p>
                  )}
                  {decisions
                    .slice()
                    .reverse()
                    .map((d, i) => {
                      const n = decisions.length - 1 - i;
                      // Their play carries their name; yours does not need one.
                      const actor = d.side === "defense" ? opponent : null;
                      const act = d.side === "defense" ? d.offenseAction ?? d.action : d.action;
                      return (
                        <div className="tmd-log-row" key={n}>
                          <div className="tmd-log-meta">
                            <span className="tmd-log-clock">{formatClock(d.before.seconds)}</span>
                            <span className={`tmd-tag ${d.fromHistory ? "real" : "sim"}`}>
                              {d.fromHistory ? "as played" : "simulated"}
                            </span>
                          </div>
                          <div className="tmd-log-desc">
                            {d.fromHistory && d.realDesc
                              ? d.realDesc
                              : narrate(act, d.outcome, d.before, d.after, actor)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="tmd-panel">
                <div className="tmd-panel-head">
                  <span>settings</span>
                </div>
                <div className="tmd-panel-body" style={{ display: "grid", gap: "0.8rem" }}>
                  <div>
                    <div className="tmd-card-meta" style={{ marginBottom: 5 }}>
                      Kicking season
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <input
                        className="tmd-slider"
                        type="range"
                        min={fg.seasons[0] ?? 1999}
                        max={fg.seasons[fg.seasons.length - 1] ?? 2025}
                        value={season}
                        onChange={(e) => setSeason(Number(e.target.value))}
                        aria-label="Kicking season"
                      />
                      <span
                        className="tmd-num"
                        style={{
                          fontFamily: "var(--display)",
                          fontStretch: "76%",
                          fontWeight: 700,
                          fontSize: 16,
                          color: season === 2025 ? "var(--accent)" : "var(--ink)",
                        }}
                      >
                        {season}
                      </span>
                    </div>
                    <div className="tmd-toggle" style={{ marginTop: 6 }}>
                      {[1999, 2012, 2025].map((y) => (
                        <button key={y} aria-pressed={season === y} onClick={() => setSeason(y)}>
                          {y}
                        </button>
                      ))}
                    </div>
                    {kickComparison && (
                      <p className="tmd-note" style={{ marginTop: 6 }}>
                        A {kickComparison.distance}-yard attempt was worth{" "}
                        <strong>{Math.round(kickComparison.then * 100)}%</strong> in {season} and{" "}
                        <strong>{Math.round(kickComparison.now * 100)}%</strong> in 2025.
                      </p>
                    )}
                    <p className="tmd-note" style={{ marginTop: 4 }}>
                      Only the kicking moves with this. The passing, the clock and what coaches
                      do stay fit on 2016 to 2025, so the slider asks what this decision looks
                      like with a different era&apos;s kicker.
                    </p>
                  </div>

                  <div>
                    <div className="tmd-card-meta" style={{ marginBottom: 5 }}>Model</div>
                    <div className="tmd-toggle">
                      <button aria-pressed={!reveal} onClick={() => setReveal(false)}>
                        Hide numbers
                      </button>
                      <button aria-pressed={reveal} onClick={() => setReveal(true)}>
                        Show the model
                      </button>
                    </div>
                    <p className="tmd-note" style={{ marginTop: 5 }}>
                      Hidden while you decide, so you get to answer the question yourself.
                      Everything is revealed in the review.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
