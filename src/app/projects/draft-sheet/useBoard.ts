"use client";

/**
 * Loads the published artifacts and rebuilds the board whenever the league
 * config or the viewer's removals change.
 *
 * `players.json` and `adp.json` are split because they refresh on different
 * cadences: rankings move when analysts change their minds, ADP moves every
 * day. The 30-day movement behind each trend arrow is precomputed into
 * `adp.json`, so the 360KB history file is no longer fetched on this tab at
 * all.
 */

import { useEffect, useMemo, useState } from "react";

import { buildBoard } from "@/lib/draft-sheet/board";
import type { Adp, LeagueConfig, Player, SheetPrefs } from "@/lib/draft-sheet/types";

export interface Meta {
  built: string;
  season: number;
  boards: Record<string, { lastUpdated: string; experts: number; players: number }>;
  attribution: Record<string, string>;
}

export function useBoardData(base = "/draft-sheet") {
  const [players, setPlayers] = useState<Player[]>([]);
  const [adp, setAdp] = useState<Map<string, Adp>>(new Map());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${base}/players.json`).then((r) => r.json()),
      fetch(`${base}/adp.json`).then((r) => r.json()),
      fetch(`${base}/meta.json`).then((r) => r.json()),
    ])
      .then(([p, a, m]) => {
        if (!live) return;
        setPlayers(p.players as Player[]);
        setAdp(new Map((a.adp as Adp[]).map((x) => [x.id, x])));
        setMeta(m as Meta);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setError("The board could not be loaded. Try a refresh.");
        setLoading(false);
      });
    return () => { live = false; };
  }, [base]);

  return { players, adp, meta, loading, error };
}

export function useBuiltBoard(
  players: Player[],
  config: LeagueConfig,
  prefs: SheetPrefs,
  depth = 60,
) {
  return useMemo(
    () => buildBoard({ players, config, prefs, depth }),
    [players, config, prefs, depth],
  );
}
