"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import WantMore from "@/app/_subscribe/WantMore";
import { MAX_PICKS } from "@/lib/start-sit/types";
import { encodeState } from "@/lib/start-sit/url";
import { Advisor } from "./Advisor";
import { Board } from "./Board";
import { PlayerPicker } from "./PlayerPicker";
import { ScoringControl } from "./ScoringControl";
import { setPicks, setScoring, useSitState } from "./store";
import { useMarket } from "./useMarket";
import { useTeams } from "./teams";

type Tab = "advisor" | "board";

export function StartSit() {
  const [tab, setTab] = useState<Tab>("advisor");
  const [copied, setCopied] = useState(false);
  const { picks, scoring } = useSitState();

  const { players, byId, games, meta, loading, error } = useMarket();
  const teams = useTeams();

  const selected = useMemo(
    () => picks.filter((id): id is string => !!id).map((id) => byId.get(id)!).filter(Boolean),
    [picks, byId],
  );
  const picked = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  const addFromBoard = useCallback((id: string) => {
    setPicks((ps: (string | null)[]) => {
      if (ps.includes(id)) return ps;
      const empty = ps.indexOf(null);
      if (empty >= 0) return ps.map((x, i) => (i === empty ? id : x));
      if (ps.length < MAX_PICKS) return [...ps, id];
      return ps;
    });
    setTab("advisor");
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const share = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeState(picks, scoring)}`;
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => undefined,
    );
  }, [picks, scoring]);

  const asOf = useMemo(() => {
    if (!meta) return null;
    const d = new Date(meta.builtAt);
    const stamp = new Intl.DateTimeFormat("en-US", {
      weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
    }).format(d).toLowerCase();
    return `Week ${meta.week} · lines as of ${stamp} ET`;
  }, [meta]);

  return (
    <div className="ss-page">
      <header className="ss-masthead">
        <div className="ss-masthead-main">
          <p className="ss-kicker">{meta ? `2026 season · week ${meta.week}` : "2026 season"}</p>
          <h1>Start/Sit by the Betting Market</h1>
          <p className="ss-dek">
            Pick two to five players and let this week&rsquo;s prop lines settle it. Receptions,
            yards and touchdown prices become expected fantasy points with a floor and a ceiling,
            and the page says so when the market cannot separate them.
          </p>
        </div>
        <div className="ss-masthead-actions">
          <Link href="/projects/start-sit/methodology" className="ss-btn">Methodology</Link>
          <WantMore project="start-sit" className="ss-btn" />
        </div>
      </header>

      <nav className="ss-tabs" role="tablist" aria-label="Sections">
        {([["advisor", "Start or sit"], ["board", "The board"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={`ss-tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)} data-tel="ss-tab">
            {label}
          </button>
        ))}
      </nav>

      <div className="ss-toolbar">
        <ScoringControl scoring={scoring} onChange={setScoring} />
        <span className="ss-toolbar-spacer" />
        {asOf && <span className="ss-asof">{asOf}</span>}
        <button type="button" className="ss-btn" onClick={share} data-tel="ss-share">
          {copied ? "Link copied" : "Share this comparison"}
        </button>
      </div>

      {loading && <p className="ss-status">Loading this week&rsquo;s lines…</p>}
      {error && <p className="ss-status ss-status--error">{error}</p>}

      {!loading && !error && (
        <>
          <div hidden={tab !== "advisor"} className="ss-main">
            <PlayerPicker picks={picks} players={players} byId={byId} teams={teams} onChange={setPicks} />
            <Advisor selected={selected} scoring={scoring} games={games} teams={teams} />
          </div>
          <div hidden={tab !== "board"} className="ss-main">
            <Board players={players} games={games} teams={teams} scoring={scoring} onAdd={addFromBoard} picked={picked} />
          </div>
        </>
      )}

      {meta && (
        <footer className="ss-sources">
          <h3>Where this comes from</h3>
          <ul>
            {Object.entries(meta.attribution).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
          <p>
            Built {meta.built}. {meta.counts.priced} of {meta.counts.pool} players carry a line this
            week{meta.counts.books ? ` across ${meta.counts.books} sportsbooks and Sleeper's pick'em` : ", all from Sleeper's pick'em until the sportsbook feed is switched on"}.
            Nothing here is a bet recommendation, and no line is a guarantee of anything.
          </p>
        </footer>
      )}
    </div>
  );
}
