"use client";

/**
 * Two hundred players, one row each.
 *
 * The board answers "who is left and what is he worth". This answers "who IS
 * this guy" — which is the question a casual drafter actually has on the clock,
 * and the one a tiered sheet cannot answer at all.
 *
 * Every blurb is composed from a signal in the data (see top200.py). Upside and
 * worst case are the genuinely sourced part: the most and least optimistic of a
 * hundred-plus experts, and the earliest and latest a player has actually gone
 * in public mock drafts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { POSITIONS } from "@/lib/draft-sheet/types";
import type { Player, Position } from "@/lib/draft-sheet/types";
import { Headshot } from "./Headshot";
import { InjuryTag } from "./InjuryTag";
import { Trend } from "./Trend";
import { TrendArrow, type Trend as Direction } from "./TrendArrow";
import { TeamLogo, useTeams } from "./teams";

interface Row {
  id: string;
  name: string;
  short: string;
  pos: Position;
  team: string | null;
  bye: number | null;
  espnId: string | null;
  headshot: string | null;
  rank: number;
  posRank: string | null;
  tier: number | null;
  adp: number | null;
  move: number | null;
  injury: Player["injury"];
  blurb: string;
  upside: string | null;
  downside: string | null;
  newsUrl: string | null;
  /** Projected this year against what he actually did last year. */
  direction: Direction | null;
  last: string | null;
}

/**
 * A headline somebody else reported, with their name on it.
 *
 * Every other number on this page is the market's opinion; this is the only
 * thing that says what actually happened. Headline and link only — the article
 * belongs to the publisher, and the point of this block is to send the reader
 * to them.
 */
interface NewsItem {
  headline: string;
  url: string;
  source: string;
  ts: string;
}

/** "2h ago" / "3d ago". Precision beyond the day is not the point. */
function ago(ts: string): string {
  const mins = Math.max(0, (Date.now() - Date.parse(ts)) / 60000);
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
}

export function Top200({
  focus,
  onFocusHandled,
}: {
  /** A player id handed over from the board, to scroll to and highlight. */
  focus?: string | null;
  onFocusHandled?: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [news, setNews] = useState<Record<string, NewsItem[]>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [q, setQ] = useState("");
  const teams = useTeams();

  useEffect(() => {
    let live = true;
    fetch("/draft-sheet/top200.json")
      .then((r) => r.json())
      .then((d) => { if (live) setRows(d.players as Row[]); })
      .catch(() => { if (live) setRows([]); });

    // Separately, and allowed to fail: a page with no headlines is the page we
    // shipped for months. A page that will not render because a wire is down
    // is a regression.
    fetch("/draft-sheet/news.json")
      .then((r) => r.json())
      .then((d) => { if (live) setNews(d.news ?? {}); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  // Arriving from a board click: take the reader to that player and flash the
  // row so the eye lands in the right place.
  //
  // Guarded by a ref rather than a cleanup, so render churn cannot cancel it.
  // And scheduled on a TIMER, not requestAnimationFrame: rAF does not run at
  // all while a tab is hidden, which silently broke this in a background tab
  // and would break it for anyone who opens the sheet in a tab they are not
  // looking at yet.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || !rows || handled.current === focus) return;
    handled.current = focus;

    let tries = 0;
    const land = () => {
      const el = document.getElementById(`ds-p-${focus}`);
      if (!el) {
        // Filtered out of the current view. Clear the filters and try again
        // once he is back in the list; give up rather than loop forever.
        if (tries++ > 8) return;
        setPos("ALL");
        setQ("");
        window.setTimeout(land, 40);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(focus);
      onFocusHandled?.();
      window.setTimeout(() => setFlash(null), 2400);
    };
    window.setTimeout(land, 0);
  }, [focus, rows, onFocusHandled]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (pos === "ALL" || r.pos === pos) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          (r.team ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, pos, q]);

  if (!rows) return <p className="ds-status">Loading the player notes…</p>;

  return (
    <div className="ds-top200">
      <div className="ds-top-bar">
        <div className="ds-presets" role="group" aria-label="Position">
          {(["ALL", ...POSITIONS.filter((p) => p !== "K" && p !== "DST")] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="ds-pill"
              aria-pressed={pos === p}
              onClick={() => setPos(p as Position | "ALL")}
              data-tel="ds-top200-pos"
            >
              {p}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="ds-top-search"
          value={q}
          placeholder="Search a player or team"
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search players"
        />
        <span className="ds-toolbar-spacer" />
        <span className="ds-asof">{shown.length} shown</span>
      </div>

      <ol className="ds-top-list">
        {shown.map((r) => (
          <li
            key={r.id}
            id={`ds-p-${r.id}`}
            className={`ds-top-row${flash === r.id ? " is-flash" : ""}`}
          >
            <span className="ds-top-rank ds-num">{r.rank}</span>

            <Headshot
              name={r.name}
              espnId={r.espnId}
              fallbackUrl={r.headshot}
              team={r.team}
              teams={teams}
            />

            <div className="ds-top-id">
              <p className="ds-top-name">
                {r.name}
                <InjuryTag injury={r.injury} />
              </p>
              <p className="ds-top-meta">
                <TeamLogo abbr={r.team} teams={teams} size={13} />
                <span className={`ds-top-pos ds-pos-${r.pos}`}>{r.posRank ?? r.pos}</span>
                {r.tier != null && <span>Tier {r.tier}</span>}
                <span>Bye {r.bye ?? "—"}</span>
              </p>
            </div>

            <div className="ds-top-proj">
              <span className="ds-top-proj-label">Projected</span>
              <span className="ds-top-proj-val ds-num">
                {r.posRank ?? "—"}
                {r.direction && (
                  <span
                    className="ds-top-dir"
                    title={`Against last season: ${r.last ?? ""}`}
                  >
                    <TrendArrow trend={r.direction} size={13} />
                  </span>
                )}
              </span>
              <span className="ds-top-proj-adp ds-num">
                ADP {r.adp != null ? Math.round(r.adp) : "—"}
                <Trend move={r.move} />
              </span>
              {r.last && <span className="ds-top-last">{r.last}</span>}
            </div>

            <div className="ds-top-say">
              <p className="ds-top-blurb">{r.blurb}</p>
              {news[r.id]?.length > 0 && (
                <ul className="ds-top-wire">
                  {news[r.id].map((n) => (
                    <li key={n.url}>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-tel="ds-player-headline"
                      >
                        {n.headline}
                      </a>
                      <span className="ds-top-wire-meta">
                        {n.source} · {ago(n.ts)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.newsUrl && (
                <a
                  className="ds-top-news"
                  href={r.newsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-tel="ds-player-news"
                >
                  Click for more news ↗
                </a>
              )}
              <div className="ds-top-case">
                {r.upside && (
                  <p className="ds-case ds-case--up">
                    <span>Upside</span>
                    {r.upside}
                  </p>
                )}
                {r.downside && (
                  <p className="ds-case ds-case--down">
                    <span>Worst case</span>
                    {r.downside}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {!shown.length && (
        <p className="ds-status">Nobody matches that. Try a different name or team.</p>
      )}

      <p className="ds-top-foot">
        <Link href="/projects/draft-sheet">← Back to the board</Link>
      </p>
    </div>
  );
}
