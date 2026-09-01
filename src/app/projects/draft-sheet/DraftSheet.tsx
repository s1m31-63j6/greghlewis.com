"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { BOARD_KEYS } from "@/lib/draft-sheet/types";
import type { BoardKey } from "@/lib/draft-sheet/types";
import WantMore from "@/app/_subscribe/WantMore";
import Tour from "@/app/_tour/Tour";
import type { TourStep } from "@/lib/tour/types";
import { Board } from "./Board";
import { ConfigBar } from "./ConfigBar";
import { BoardStrip } from "./BoardStrip";
import { TeamNews } from "./TeamNews";
import { Top200 } from "./Top200";
import {
  encodeConfig,
  patchRoster,
  patchScoring,
  setConfig as storeSetConfig,
  toggle,
  togglePlatform,
} from "./sheetStore";
import { useSheetState } from "./useSheetState";
import { withRemoved } from "@/lib/draft-sheet/board";
import { useBoardData, useBuiltBoard } from "./useBoard";
import { useTeams } from "./teams";

const BOARD_LABEL: Record<BoardKey, string> = {
  standard: "standard",
  half: "half-PPR",
  ppr: "full-PPR",
  superflex: "superflex",
  "half-superflex": "half-PPR superflex",
};

/**
 * The tour.
 *
 * Eight steps, walking a reader through an actual draft prep: set scoring,
 * pull your league in, read tiers, find the value, mark your targets, print it.
 * It ends on the print button but does not navigate there — "Get started"
 * leaves them on the board, which is where the work happens.
 *
 * Module-level rather than built in the component: none of it depends on state,
 * and a stable array is one less thing for <Tour> to defend against.
 *
 * Targets are `data-tour` attributes or structural classes, never `data-tel`.
 * Telemetry labels are their own vocabulary and renaming one should not
 * silently break the tour.
 */
const SETTINGS_BTN = '[data-tour="settings"]';

/**
 * Targets resolve with `document.querySelector`, so a plain descendant selector
 * already means "the first one in document order" — the first tier of the first
 * column, and the first row inside it.
 *
 * Deliberately not the `:first-of-type` pseudo-class, which counts element type
 * and not class: inside `.ds-col` the first `div` is the column key, so a tier
 * selector written that way matched nothing and the step pointed at empty space.
 */
const FIRST_TIER = ".ds-board .ds-tier";
const FIRST_ROW = ".ds-board .ds-row";

function setSettings(open: boolean) {
  const btn = document.querySelector<HTMLButtonElement>(SETTINGS_BTN);
  if (btn && (btn.getAttribute("aria-expanded") === "true") !== open) btn.click();
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="scoring"]',
    title: "Start with your scoring",
    body:
      "Set this before anything else. Full PPR, half or standard moves the draft order a long way — receivers most of all — and everything you do after this builds on it.",
    side: "bottom",
    align: "start",
  },
  {
    target: ".ds-import",
    title: "On Sleeper? Import your league",
    body:
      "Type your Sleeper username, or paste your league ID — the long number in your league's URL — and your scoring and roster slots come across in one go. ESPN and Yahoo have to be set by hand below. In a keeper league, mark each keeper with the × on their row: the board then recomputes where every position runs dry.",
    side: "bottom",
    align: "start",
    before: () => setSettings(true),
    waitFor: 1200,
  },
  {
    target: ".ds-strip-chip",
    title: "These are not my opinions",
    body:
      "The order comes from the published expert consensus for the format you just picked — dozens of analysts, averaged. Your league settings shift positions against each other, but never reorder players within a position.",
    side: "bottom",
    align: "start",
    before: () => setSettings(false),
  },
  {
    target: FIRST_TIER,
    title: "Draft by tier, not by rank",
    body:
      "Players inside one bracket carry similar upside and similar risk — the experts expect them to land in roughly the same place by the end of the season. So take the cheapest name in a tier, and when a bracket is nearly empty, that is your cue to take one now.",
    side: "right",
    align: "start",
  },
  {
    target: `${FIRST_ROW} .ds-name`,
    title: "Click a name to research him",
    body:
      "Every name opens his write-up: the injury situation, what changed for him this offseason, and how far apart the experts are on him.",
    side: "bottom",
    align: "start",
  },
  {
    target: FIRST_ROW,
    // The platform columns are sibling grid cells with no wrapper, so the
    // spotlight is drawn from the union of their boxes rather than the row's.
    rect: () => {
      const row = document.querySelector(FIRST_ROW);
      const cells = row ? [...row.querySelectorAll(".ds-cell")] : [];
      if (!cells.length) return null;
      const r = cells.map((c) => c.getBoundingClientRect());
      const left = Math.min(...r.map((x) => x.left));
      const top = Math.min(...r.map((x) => x.top));
      return new DOMRect(
        left,
        top,
        Math.max(...r.map((x) => x.right)) - left,
        Math.max(...r.map((x) => x.bottom)) - top,
      );
    },
    title: "This is where you find value",
    body:
      "Sites disagree about players, and that disagreement is your edge. These columns show where Yahoo, ESPN, Sleeper and mock drafters are actually taking him. Green means he lasts longer on that site, so you can wait a round. Red means he is gone earlier than you would expect.",
    side: "bottom",
    align: "start",
  },
  {
    target: `${FIRST_ROW} .ds-star`,
    title: "Star the players you want",
    body:
      "Stars stay in this browser and carry straight onto the printed sheet, so the players you are targeting are already marked when you sit down at the table.",
    side: "right",
  },
  {
    target: '[data-tour="print"]',
    title: "Then print it and draft",
    body:
      "Two pages, one position per column, with your stars and your keepers already applied. Paper needs no signal at the draft table.",
    side: "left",
    doneLabel: "Get started",
  },
];

type Tab = "board" | "teams" | "top200";

export function DraftSheet() {
  const [tab, setTab] = useState<Tab>("board");
  const [showRemoved, setShowRemoved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Set when a name is clicked on the board: switch tabs and take the reader
  // to that player rather than making them scroll two hundred rows.
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null);

  /**
   * Scroll position per tab.
   *
   * The three tabs are different lengths, so carrying one scroll position
   * across all of them lands you in the middle of nowhere — a tap on "Top 200"
   * from halfway down the board opened somewhere around player 90. Each tab now
   * remembers where it was, and a tab you have not opened yet starts at the top.
   */
  const scrollByTab = useRef<Partial<Record<Tab, number>>>({});

  /**
   * Tabs are mounted on first visit and KEPT mounted afterwards, hidden rather
   * than unmounted.
   *
   * Unmounting meant every switch refetched and re-rendered from scratch, so at
   * the moment the scroll was restored the document was still 970px tall: the
   * restore clamped to the bottom of nothing, and then scroll anchoring threw
   * the page 28,000px down as the rows painted in. Keeping a visited panel
   * alive makes its height correct the instant it is shown, and switching tabs
   * costs nothing.
   *
   * Still lazy on first visit, so nobody downloads the Top 200 or the offseason
   * data unless they ask for it.
   */
  const [mounted, setMounted] = useState<Set<Tab>>(() => new Set<Tab>(["board"]));

  const { config, prefs } = useSheetState();
  // Lives in the store, not here: the printed sheet is a different route
  // reading the same state, and as component state this could never reach it.
  const platforms = prefs.platforms;
  const { players, adp, meta, loading, error } = useBoardData();
  const teams = useTeams();
  const base = useBuiltBoard(players, config, prefs);
  // Only while the box is ticked. The default board is untouched.
  const built = useMemo(
    () => (showRemoved ? withRemoved(base) : base),
    [base, showRemoved],
  );

  const onStar = useCallback((id: string) => toggle("starred", id), []);
  const onRemove = useCallback((id: string) => toggle("removed", id), []);
  const selectTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      scrollByTab.current[tab] = window.scrollY;
      setMounted((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
      setTab(next);
    },
    [tab],
  );

  const onOpen = useCallback(
    (id: string) => {
      scrollByTab.current[tab] = window.scrollY;
      // Opening a specific player overrides the remembered position — Top200
      // scrolls to him itself, and restoring first would fight it.
      scrollByTab.current.top200 = 0;
      setMounted((seen) => (seen.has("top200") ? seen : new Set(seen).add("top200")));
      setFocusPlayer(id);
      setTab("top200");
    },
    [tab],
  );
  // Must be stable. As an inline arrow this changed identity every render, so
  // the effect that scrolls to the player kept tearing down its own timer
  // before it could fire and the row never highlighted.
  const clearFocus = useCallback(() => setFocusPlayer(null), []);

  // Restore after the new tab has painted, or the page is still the old height
  // and the browser clamps the scroll.
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.scrollTo({ top: scrollByTab.current[tab] ?? 0, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab]);

  const share = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?cfg=${encodeConfig(config)}`;
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => undefined,
    );
  }, [config]);

  const asOf = useMemo(() => {
    if (!meta) return null;
    const b = meta.boards[built.board] ?? meta.boards.ppr;
    return b ? `${b.experts} experts · updated ${b.lastUpdated}` : null;
  }, [meta, built.board]);

  return (
    <div className="ds-page">
      <Tour project="draft-sheet" steps={TOUR_STEPS} />

      <header className="ds-masthead">
        <div className="ds-masthead-main">
          <p className="ds-kicker">2026 season</p>
          <h1>A Draft Board for the Casual Fan</h1>
          <p className="ds-dek">
            Spent your summer doing something more rewarding than refreshing X and watching NFL Network? Don’t worry — we’ve got you covered.
          </p>
        </div>
        <div className="ds-masthead-actions">
          <Link href="/projects/draft-sheet/methodology" className="ds-btn ds-btn-ghost">
            Methodology
          </Link>
          <WantMore project="draft-sheet" className="ds-btn ds-btn-ghost" />
        </div>
      </header>

      <nav className="ds-tabs" role="tablist" aria-label="Sections">
        {([
          ["board", "The board"],
          ["top200", "Top 200 players"],
          ["teams", "Offseason by team"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ds-tab${tab === id ? " active" : ""}`}
            onClick={() => selectTab(id as Tab)}
            data-tel="ds-tab"
          >
            {label}
          </button>
        ))}
      </nav>

      <div hidden={tab !== "board"}>
          <ConfigBar
            config={config}
            setConfig={storeSetConfig}
            setRoster={patchRoster}
            setScoring={patchScoring}
          />

          <div className="ds-toolbar">
            <span className="ds-toolbar-spacer" />
            {asOf && <span className="ds-asof">{asOf}</span>}
            <label className="ds-check">
              <input
                type="checkbox"
                checked={showRemoved}
                onChange={(e) => setShowRemoved(e.target.checked)}
              />
              Show removed
              {base.removed.length > 0 && (
                <span className="ds-removed-count">{base.removed.length}</span>
              )}
            </label>
            <button type="button" className="ds-btn ds-btn-ghost" onClick={share} data-tel="ds-share">
              {copied ? "Link copied" : "Share settings"}
            </button>
            <Link href="/projects/draft-sheet/print" className="ds-btn ds-btn-primary" data-tel="ds-print" data-tour="print">
              Print sheet
            </Link>
          </div>

          <BoardStrip
            boardLabel={BOARD_LABEL[built.board]}
            departure={built.maxDeparture}
            visible={platforms}
            onToggle={togglePlatform}
          />

          {loading && <p className="ds-status">Loading the board…</p>}
          {error && <p className="ds-status ds-status--error">{error}</p>}
          {!loading && !error && (
            <Board
              built={built}
              adp={adp}
              teams={teams}
              platforms={platforms}
              prefs={prefs}
              onStar={onStar}
              onRemove={onRemove}
              onOpen={onOpen}
              showRemoved={showRemoved}
            />
          )}
      </div>

      {mounted.has("top200") && (
        <div hidden={tab !== "top200"}>
          <Top200 focus={focusPlayer} onFocusHandled={clearFocus} />
        </div>
      )}

      {mounted.has("teams") && (
        <div hidden={tab !== "teams"}>
          <TeamNews teams={teams} />
        </div>
      )}

      {meta && (
        <footer className="ds-sources">
          <h3>Where this comes from</h3>
          <ul>
            {Object.entries(meta.attribution).map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
          <p>Built {meta.built}. Boards: {BOARD_KEYS.length} published consensus formats.</p>
        </footer>
      )}
    </div>
  );
}
