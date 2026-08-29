"use client";

/**
 * The sheet's own state, kept outside React.
 *
 * localStorage is the source of truth and there is no server in the write path.
 * A draft happens once a year, in somebody's basement, on hotel wifi, under a
 * ninety-second clock — if the primary store were the network, a dropped
 * connection at pick three would cost you the sheet.
 *
 * This is an external store read through `useSyncExternalStore` rather than a
 * `useState` hydrated in an effect. Storage genuinely IS an external system, so
 * this is the primitive that fits: it renders the server snapshot during SSR,
 * swaps to the stored value after hydration without a cascading render, and
 * gives the print route — a separate document on the same origin — the exact
 * same view with no prop threading.
 *
 * The consequence, which the interface states plainly rather than burying: no
 * accounts means the sheet lives in THIS browser. Clearing site data, or
 * opening it on a phone instead of a laptop, starts fresh.
 */

import { defaultConfig } from "@/lib/draft-sheet/presets";
import type { LeagueConfig, SheetPrefs } from "@/lib/draft-sheet/types";

const KEY = "ds:sheet:v1";
const DEBOUNCE_MS = 300;

export interface SheetState {
  config: LeagueConfig;
  prefs: SheetPrefs;
}

const EMPTY_PREFS: SheetPrefs = { removed: [], starred: [], notes: {} };

/** Stable identity for SSR and for a browser with storage switched off. */
const SERVER_STATE: SheetState = {
  config: defaultConfig(),
  prefs: EMPTY_PREFS,
};

let cache: SheetState | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/**
 * Anything arriving from storage or a URL is untrusted shape. A codec that
 * silently drops `teRecBonus` produces a board that is subtly wrong and looks
 * completely fine, so every field is validated rather than spread.
 */
export function saneConfig(v: unknown): LeagueConfig | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const d = defaultConfig();
  const r = (o.roster ?? {}) as Record<string, unknown>;
  const s = (o.scoring ?? {}) as Record<string, unknown>;
  const int = (x: unknown, fb: number, lo: number, hi: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fb;
  };
  const flt = (x: unknown, fb: number, lo: number, hi: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
  };
  return {
    v: 1,
    name: typeof o.name === "string" ? o.name.slice(0, 60) : d.name,
    teams: int(o.teams, d.teams, 4, 20),
    roster: {
      QB: int(r.QB, d.roster.QB, 0, 4),
      RB: int(r.RB, d.roster.RB, 0, 6),
      WR: int(r.WR, d.roster.WR, 0, 8),
      TE: int(r.TE, d.roster.TE, 0, 4),
      FLEX: int(r.FLEX, d.roster.FLEX, 0, 5),
      SUPERFLEX: int(r.SUPERFLEX, d.roster.SUPERFLEX, 0, 2),
      K: int(r.K, d.roster.K, 0, 2),
      DST: int(r.DST, d.roster.DST, 0, 2),
      BENCH: int(r.BENCH, d.roster.BENCH, 0, 20),
    },
    scoring: {
      rec: flt(s.rec, d.scoring.rec, 0, 2),
      passTd: int(s.passTd, d.scoring.passTd, 1, 10),
      teRecBonus: flt(s.teRecBonus, d.scoring.teRecBonus, 0, 2),
    },
    adpSource: (["mean", "yahoo", "espn", "sleeper", "ffc"] as const).includes(
      o.adpSource as never,
    )
      ? (o.adpSource as LeagueConfig["adpSource"])
      : d.adpSource,
  };
}

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function hydrate(): SheetState {
  // A private window is a perfectly reasonable place to look at a draft board.
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SERVER_STATE;
    const p = JSON.parse(raw);
    return {
      config: saneConfig(p?.config) ?? defaultConfig(),
      prefs: {
        removed: ids(p?.removed),
        starred: ids(p?.starred),
        notes: p?.notes && typeof p.notes === "object" ? p.notes : {},
      },
    };
  } catch {
    return SERVER_STATE;
  }
}

/** A `?cfg=` on the URL wins over storage: it is the more deliberate act. */
function fromUrl(): LeagueConfig | null {
  try {
    const param = new URLSearchParams(window.location.search).get("cfg");
    if (!param) return null;
    return saneConfig(JSON.parse(decodeURIComponent(atob(param))));
  } catch {
    return null;
  }
}

export function encodeConfig(c: LeagueConfig): string {
  return btoa(encodeURIComponent(JSON.stringify(c)));
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getSnapshot(): SheetState {
  if (cache === null) {
    const stored = hydrate();
    const url = fromUrl();
    cache = url ? { ...stored, config: url } : stored;
  }
  return cache;
}

export function getServerSnapshot(): SheetState {
  return SERVER_STATE;
}

function persist(state: SheetState) {
  if (timer) clearTimeout(timer);
  // Debounced, and deliberately NOT on beforeunload: that fires unreliably on
  // mobile, which is exactly where a phone-in-a-basement session lives.
  timer = setTimeout(() => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ v: 1, ...state.prefs, config: state.config, updatedAt: Date.now() }),
      );
    } catch {
      // Storage disabled or full. The sheet still works for this session.
    }
  }, DEBOUNCE_MS);
}

export function update(fn: (s: SheetState) => SheetState): void {
  cache = fn(getSnapshot());
  persist(cache);
  listeners.forEach((l) => l());
}

export function setConfig(c: LeagueConfig): void {
  update((s) => ({ ...s, config: c }));
}

export function patchConfig(patch: Partial<LeagueConfig>): void {
  update((s) => ({ ...s, config: { ...s.config, ...patch } }));
}

export function patchRoster(patch: Partial<LeagueConfig["roster"]>): void {
  update((s) => ({ ...s, config: { ...s.config, roster: { ...s.config.roster, ...patch } } }));
}

export function patchScoring(patch: Partial<LeagueConfig["scoring"]>): void {
  update((s) => ({ ...s, config: { ...s.config, scoring: { ...s.config.scoring, ...patch } } }));
}

export function toggle(field: "removed" | "starred", id: string): void {
  update((s) => {
    const set = new Set(s.prefs[field]);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    return { ...s, prefs: { ...s.prefs, [field]: [...set] } };
  });
}
