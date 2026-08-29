"use client";

import { useState } from "react";

import {
  currentSeason,
  describe,
  fetchLeague,
  leaguesForUser,
  looksLikeLeagueId,
  toConfig,
  type LeagueChoice,
} from "@/lib/draft-sheet/import-sleeper";
import type { LeagueConfig } from "@/lib/draft-sheet/types";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "choose"; leagues: LeagueChoice[] }
  | { kind: "done"; config: LeagueConfig }
  | { kind: "error"; message: string };

/**
 * Sleeper only, and the copy says so plainly.
 *
 * Sleeper's read API is public and CORS-open, so this runs entirely in the
 * browser with no server, no secret and nothing stored. ESPN and Yahoo cannot
 * work that way — ESPN's private leagues need live session cookies and Yahoo
 * needs OAuth — so rather than half-offer them, the panel says what it can do
 * and points everyone else at the settings form, which takes about thirty
 * seconds anyway.
 */
export function ImportLeague({ onImport }: { onImport: (c: LeagueConfig) => void }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    setState({ kind: "loading" });
    try {
      if (looksLikeLeagueId(q)) {
        const config = toConfig(await fetchLeague(q));
        onImport(config);
        setState({ kind: "done", config });
        return;
      }
      const season = await currentSeason();
      const leagues = await leaguesForUser(q, season);
      if (!leagues.length) {
        setState({
          kind: "error",
          message: `No ${season} leagues found for “${q}”. Check the spelling, or paste a league ID instead.`,
        });
        return;
      }
      if (leagues.length === 1) {
        await pick(leagues[0].id);
        return;
      }
      setState({ kind: "choose", leagues });
    } catch {
      setState({
        kind: "error",
        message: looksLikeLeagueId(q)
          ? "That league ID did not resolve. It is the long number in your Sleeper URL."
          : "That username did not resolve. Sleeper usernames are case-insensitive but must match exactly.",
      });
    }
  }

  async function pick(id: string) {
    setState({ kind: "loading" });
    try {
      const config = toConfig(await fetchLeague(id));
      onImport(config);
      setState({ kind: "done", config });
    } catch {
      setState({ kind: "error", message: "That league could not be loaded." });
    }
  }

  return (
    <div className="ds-import">
      <form onSubmit={submit} className="ds-import-form">
        <label htmlFor="ds-import-input">Import from Sleeper</label>
        <div className="ds-import-row">
          <input
            id="ds-import-input"
            type="text"
            value={value}
            placeholder="Sleeper username or league ID"
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="ds-btn ds-btn-primary" data-tel="ds-import">
            {state.kind === "loading" ? "Loading…" : "Import"}
          </button>
        </div>
        <p className="ds-import-hint">
          Reads your scoring and roster slots straight from Sleeper. Nothing is sent anywhere
          and nothing is stored — the request goes from your browser to Sleeper.{" "}
          <strong>ESPN and Yahoo are not offered:</strong> ESPN would require you to paste live
          session cookies, and Yahoo requires an OAuth app. Set those leagues up by hand below.
        </p>
      </form>

      {state.kind === "choose" && (
        <div className="ds-import-choose">
          <p>Which league?</p>
          <ul>
            {state.leagues.map((l) => (
              <li key={l.id}>
                <button type="button" className="ds-pill" onClick={() => pick(l.id)}>
                  {l.name} <span>· {l.teams} teams</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === "done" && (
        <p className="ds-import-ok">
          Imported <strong>{state.config.name}</strong> — {describe(state.config)}
        </p>
      )}

      {state.kind === "error" && <p className="ds-import-error">{state.message}</p>}
    </div>
  );
}
