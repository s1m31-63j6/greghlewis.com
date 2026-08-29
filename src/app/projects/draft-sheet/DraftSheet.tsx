"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import { BOARD_KEYS, PLATFORMS } from "@/lib/draft-sheet/types";
import type { BoardKey, PlatformKey } from "@/lib/draft-sheet/types";
import WantMore from "@/app/_subscribe/WantMore";
import { Board } from "./Board";
import { ConfigBar } from "./ConfigBar";
import { Legend } from "./Legend";
import { TeamNews } from "./TeamNews";
import { Top200 } from "./Top200";
import {
  encodeConfig,
  patchRoster,
  patchScoring,
  setConfig as storeSetConfig,
  toggle,
} from "./sheetStore";
import { useSheetState } from "./useSheetState";
import { useBoardData, useBuiltBoard } from "./useBoard";
import { useTeams } from "./teams";

const BOARD_LABEL: Record<BoardKey, string> = {
  standard: "standard",
  half: "half-PPR",
  ppr: "full-PPR",
  superflex: "superflex",
  "half-superflex": "half-PPR superflex",
};

type Tab = "board" | "teams" | "top200";

export function DraftSheet() {
  const [tab, setTab] = useState<Tab>("board");
  const [showRemoved, setShowRemoved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformKey[]>(
    () => PLATFORMS.map((p) => p.key),
  );
  // Set when a name is clicked on the board: switch tabs and take the reader
  // to that player rather than making them scroll two hundred rows.
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null);

  const { config, prefs } = useSheetState();
  const { players, adp, meta, loading, error } = useBoardData();
  const teams = useTeams();
  const built = useBuiltBoard(players, config, prefs);

  // Keep the canonical lane order however they are toggled, so the columns
  // never reshuffle under the reader.
  const togglePlatform = useCallback((key: PlatformKey) => {
    setPlatforms((cur) =>
      cur.includes(key)
        ? cur.filter((k) => k !== key)
        : PLATFORMS.map((p) => p.key).filter((k) => cur.includes(k) || k === key),
    );
  }, []);

  const onStar = useCallback((id: string) => toggle("starred", id), []);
  const onRemove = useCallback((id: string) => toggle("removed", id), []);
  const onOpen = useCallback((id: string) => {
    setFocusPlayer(id);
    setTab("top200");
  }, []);
  // Must be stable. As an inline arrow this changed identity every render, so
  // the effect that scrolls to the player kept tearing down its own timer
  // before it could fire and the row never highlighted.
  const clearFocus = useCallback(() => setFocusPlayer(null), []);

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
      <header className="ds-masthead">
        <div className="ds-masthead-main">
          <p className="ds-kicker">2026 · Tiers, ADP and the offseason you missed</p>
          <h1>A Draft Sheet for More Casual Fans</h1>
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
            onClick={() => setTab(id as Tab)}
            data-tel="ds-tab"
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "board" && (
        <>
          <ConfigBar
            config={config}
            setConfig={storeSetConfig}
            setRoster={patchRoster}
            setScoring={patchScoring}
            departure={built.maxDeparture}
            boardLabel={BOARD_LABEL[built.board]}
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
            </label>
            <button type="button" className="ds-btn ds-btn-ghost" onClick={share} data-tel="ds-share">
              {copied ? "Link copied" : "Share settings"}
            </button>
            <Link href="/projects/draft-sheet/print" className="ds-btn ds-btn-primary" data-tel="ds-print">
              Print sheet
            </Link>
          </div>

          {/*
            No accounts, so the sheet lives in this browser. Said where the work
            happens rather than buried in a footer, because somebody who spends
            twenty minutes marking keepers deserves to know that clearing site
            data or switching to their phone starts over.
          */}
          <p className="ds-storage-note">
            Your settings, stars and removed players are saved in <strong>this browser only</strong> —
            there are no accounts. Clearing site data, or opening this on another device, starts fresh.
            Use <em>Share settings</em> to carry your league setup to another device.
          </p>

          <Legend visible={platforms} onToggle={togglePlatform} />

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
        </>
      )}

      {tab === "top200" && (
        <Top200 focus={focusPlayer} onFocusHandled={clearFocus} />
      )}

      {tab === "teams" && <TeamNews teams={teams} />}

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
