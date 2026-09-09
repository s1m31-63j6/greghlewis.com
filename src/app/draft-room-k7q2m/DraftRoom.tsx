"use client";

// One-time hidden draft room. Everyone polls the same state every two
// seconds; the server's conditional write is what keeps two picks from
// landing in the same slot. See src/lib/draft-room/store.ts.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  KEEPERS,
  KEPT_IDS,
  pickOwner,
  POOL_POSITIONS,
  ROUNDS,
  TEAMS,
  TOTAL_PICKS,
  type Team,
} from "@/lib/draft-room/league";
import type { DraftState, Pick } from "@/lib/draft-room/store";

const API = "/api/draft-room-k7q2m";
const ME_KEY = "draft-room-me";
const POLL_MS = 2000;

type Player = { id: string; name: string; pos: string; team: string; bye: number; ecrStd: number; yahoo: number | null };

export function DraftRoom() {
  const [players, setPlayers] = useState<Map<string, Player> | null>(null);
  const [state, setState] = useState<DraftState | null>(null);
  const [me, setMe] = useState<Team | null>(null);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ME_KEY);
      if (saved && TEAMS.includes(saved as Team)) setMe(saved as Team);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/draft-sheet/players.json").then((r) => r.json()),
      fetch("/draft-sheet/adp.json").then((r) => r.json()),
    ]).then(([p, a]) => {
      const yahoo = new Map<string, number | null>(
        (a.adp as { id: string; raw: { yahoo: number | null } }[]).map((x) => [x.id, x.raw?.yahoo ?? null]),
      );
      const map = new Map<string, Player>();
      for (const x of p.players as Omit<Player, "yahoo">[]) {
        map.set(x.id, { ...x, yahoo: yahoo.get(x.id) ?? null });
      }
      setPlayers(map);
    });
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const post = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(API, { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong");
      if (data.picks) setState(data);
      else await refresh();
    } finally {
      setBusy(false);
    }
  };

  const chooseMe = (t: Team) => {
    setMe(t);
    try {
      localStorage.setItem(ME_KEY, t);
    } catch {}
  };

  const picks = state?.picks ?? [];
  const taken = useMemo(() => new Set(picks.map((p) => p.playerId)), [picks]);
  const index = picks.length;
  const over = index >= TOTAL_PICKS;
  const onClock = over ? null : pickOwner(index);
  const myTurn = Boolean(state?.started && me && onClock === me);

  const available = useMemo(() => {
    if (!players) return [];
    const q = query.trim().toLowerCase();
    return [...players.values()]
      .filter((p) => POOL_POSITIONS.has(p.pos) && !KEPT_IDS.has(p.id) && !taken.has(p.id))
      .filter((p) => pos === "ALL" || p.pos === pos)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => (a.yahoo ?? 999) - (b.yahoo ?? 999) || a.ecrStd - b.ecrStd)
      .slice(0, 75);
  }, [players, taken, query, pos]);

  if (!players || !state) return <main className="dr"><p className="dr-muted">Loading the board…</p></main>;

  if (!me) {
    return (
      <main className="dr">
        <h1>Who are you?</h1>
        <div className="dr-teams">
          {TEAMS.map((t) => (
            <button key={t} className="dr-btn" onClick={() => chooseMe(t)}>{t}</button>
          ))}
        </div>
      </main>
    );
  }

  const name = (id: string) => players.get(id)?.name ?? id;
  const round = Math.floor(index / TEAMS.length) + 1;
  const slot = (index % TEAMS.length) + 1;

  return (
    <main className="dr">
      <header className="dr-head">
        <div>
          {!state.started && <span className="dr-status">Waiting to start</span>}
          {state.started && !over && (
            <span className="dr-status">
              Round {round}, pick {slot} · <strong className={myTurn ? "dr-you" : ""}>{onClock} {myTurn ? "(you!)" : ""}</strong> on the clock
            </span>
          )}
          {over && <span className="dr-status">Draft complete</span>}
        </div>
        <div className="dr-actions">
          {!state.started && (
            <button className="dr-btn dr-primary" disabled={busy} onClick={() => post({ action: "start" })}>Start draft</button>
          )}
          <label className="dr-muted">
            Drafting as{" "}
            <select value={me} onChange={(e) => chooseMe(e.target.value as Team)}>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
      </header>
      {error && <p className="dr-error">{error}</p>}

      <div className="dr-grid">
        <section className="dr-pool">
          <div className="dr-filters">
            <input placeholder="Search players" value={query} onChange={(e) => setQuery(e.target.value)} />
            {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
              <button key={p} className={`dr-chip ${pos === p ? "on" : ""}`} onClick={() => setPos(p)}>{p}</button>
            ))}
          </div>
          <table>
            <thead><tr><th>ADP</th><th>Player</th><th>Pos</th><th>Team</th><th>Bye</th><th /></tr></thead>
            <tbody>
              {available.map((p) => (
                <tr key={p.id}>
                  <td className="dr-num">{p.yahoo ?? "—"}</td>
                  <td>{p.name}</td>
                  <td>{p.pos}</td>
                  <td>{p.team}</td>
                  <td>{p.bye}</td>
                  <td>
                    <button
                      className="dr-btn dr-small"
                      disabled={!myTurn || busy}
                      onClick={() => post({ action: "pick", playerId: p.id, team: me, by: me })}
                    >
                      Draft
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="dr-rosters">
          {TEAMS.map((t) => {
            const mine = picks.filter((p) => p.team === t);
            return (
              <div key={t} className={`dr-card ${t === onClock ? "clock" : ""} ${t === me ? "me" : ""}`}>
                <h3>{t}</h3>
                <ul>
                  {KEEPERS[t].map((id) => <li key={id} className="dr-keeper">{players.get(id)?.pos} · {name(id)}</li>)}
                  {mine.map((p) => <li key={p.index}>{players.get(p.playerId)?.pos} · {name(p.playerId)}</li>)}
                </ul>
              </div>
            );
          })}
        </aside>
      </div>

      <section className="dr-log">
        <h3>Picks</h3>
        <ol>
          {picks.map((p: Pick) => (
            <li key={p.index}>
              <span className="dr-muted">{Math.floor(p.index / TEAMS.length) + 1}.{(p.index % TEAMS.length) + 1}</span> {p.team}: {name(p.playerId)}
            </li>
          ))}
        </ol>
        {picks.length > 0 && !over && (
          <button className="dr-link" disabled={busy} onClick={() => post({ action: "undo" })}>Undo last pick</button>
        )}
        <p className="dr-muted">{ROUNDS} rounds, snake. {TOTAL_PICKS - index} picks left.</p>
      </section>
    </main>
  );
}
