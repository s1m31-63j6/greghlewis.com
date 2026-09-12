"use client";

/**
 * The viewer's picks and scoring, as an external store.
 *
 * Read from the URL first (a shared link), then from this browser's last
 * session, then the defaults. The server renders the defaults and the client
 * takes over with the real values through useSyncExternalStore, which is the
 * one hydration-safe way to do this without a setState inside an effect.
 */

import { useSyncExternalStore } from "react";

import type { Scoring } from "@/lib/start-sit/types";
import { DEFAULT_SCORING, DEFAULT_SLOTS, MAX_PICKS } from "@/lib/start-sit/types";
import { decodeState } from "@/lib/start-sit/url";

export interface SitState {
  picks: (string | null)[];
  scoring: Scoring;
}

const STORAGE = "start-sit:v1";
const DEFAULT: SitState = {
  picks: Array.from({ length: DEFAULT_SLOTS }, () => null),
  scoring: DEFAULT_SCORING,
};

let state: SitState = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function slots(ids: string[]): (string | null)[] {
  const n = Math.min(MAX_PICKS, Math.max(DEFAULT_SLOTS, ids.length));
  return Array.from({ length: n }, (_, i) => ids[i] ?? null);
}

function load(): SitState {
  const fromUrl = decodeState(window.location.search);
  if (fromUrl.ids.length || window.location.search.includes("s=")) {
    return { picks: slots(fromUrl.ids), scoring: fromUrl.scoring };
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE) ?? "null");
    if (Array.isArray(saved?.ids) && saved?.scoring) {
      const s = decodeState(`?p=${saved.ids.join(",")}&s=${saved.scoring.rec}-${saved.scoring.passTd}`);
      return { picks: slots(s.ids), scoring: s.scoring };
    }
  } catch { /* a fresh browser */ }
  return DEFAULT;
}

function get(): SitState {
  if (!loaded && typeof window !== "undefined") {
    state = load();
    loaded = true;
  }
  return state;
}

function set(next: SitState): void {
  state = next;
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify({
      ids: next.picks.filter(Boolean), scoring: next.scoring,
    }));
  } catch { /* storage unavailable */ }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPicks(next: (string | null)[] | ((ps: (string | null)[]) => (string | null)[])): void {
  set({ ...get(), picks: typeof next === "function" ? next(get().picks) : next });
}

export function setScoring(scoring: Scoring): void {
  set({ ...get(), scoring });
}

export function useSitState(): SitState {
  return useSyncExternalStore(subscribe, get, () => DEFAULT);
}
