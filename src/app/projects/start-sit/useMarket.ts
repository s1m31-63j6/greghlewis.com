"use client";

/**
 * Loads the week's artifacts once. Everything on the page derives from these
 * three files plus the viewer's picks and scoring.
 */

import { useEffect, useState } from "react";

import type { Game, Meta, Player } from "@/lib/start-sit/types";

export interface Market {
  players: Player[];
  byId: Map<string, Player>;
  games: Map<string, Game>;
  meta: Meta | null;
  loading: boolean;
  error: string | null;
}

export function useMarket(base = "/start-sit"): Market {
  const [state, setState] = useState<Market>({
    players: [], byId: new Map(), games: new Map(), meta: null, loading: true, error: null,
  });

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${base}/players.json`).then((r) => r.json()),
      fetch(`${base}/games.json`).then((r) => r.json()),
      fetch(`${base}/meta.json`).then((r) => r.json()),
    ])
      .then(([p, g, m]) => {
        if (!live) return;
        const players = p.players as Player[];
        setState({
          players,
          byId: new Map(players.map((x) => [x.id, x])),
          games: new Map((g.games as Game[]).map((x) => [x.id, x])),
          meta: m as Meta,
          loading: false,
          error: null,
        });
      })
      .catch(() => {
        if (!live) return;
        setState((s) => ({ ...s, loading: false, error: "The lines could not be loaded. Try a refresh." }));
      });
    return () => { live = false; };
  }, [base]);

  return state;
}
