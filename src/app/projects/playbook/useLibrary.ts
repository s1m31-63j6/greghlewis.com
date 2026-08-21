"use client";

/**
 * Library loading and search state.
 *
 * The library is static JSON under `public/playbook/`, fetched once. Only a
 * coach's own playbooks touch DynamoDB — the 127 library plays never do, which
 * keeps the browse experience instant and free.
 *
 * The index is rebuilt for user plays through the SAME `buildIndexEntry` the
 * offline build uses, so a play a coach wrote is searchable by exactly the same
 * rules as one that shipped with the app.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildIndexEntry, matchPlay, parseQuery, withoutConstraint } from "@/lib/playbook/search";
import type {
  FieldVariantId,
  Filters,
  Play,
  PlayIndexEntry,
  PlaySpec,
} from "@/lib/playbook/types";

export interface LibraryMeta {
  playCount: number;
  formationCount: number;
  routeCount: number;
  schemeCount: number;
  frontCount: number;
  coverageCount: number;
  pressureCount: number;
  byPhilosophy: Record<string, number>;
  byVariant: Record<string, number>;
}

interface State {
  specs: PlaySpec[];
  index: PlayIndexEntry[];
  meta: LibraryMeta | null;
  loading: boolean;
  error: string | null;
}

export function useLibrary() {
  const [state, setState] = useState<State>({
    specs: [],
    index: [],
    meta: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/playbook/plays.json").then((r) => r.json() as Promise<PlaySpec[]>),
      fetch("/playbook/index.json").then((r) => r.json() as Promise<PlayIndexEntry[]>),
      fetch("/playbook/meta.json").then((r) => r.json() as Promise<LibraryMeta>),
    ])
      .then(([specs, index, meta]) => {
        if (live) setState({ specs, index, meta, loading: false, error: null });
      })
      .catch((e: Error) => {
        if (live) setState((s) => ({ ...s, loading: false, error: e.message }));
      });
    return () => {
      live = false;
    };
  }, []);

  const byId = useMemo(() => new Map(state.specs.map((s) => [s.id, s])), [state.specs]);

  return { ...state, byId };
}

/**
 * One search box serving two jobs: free text, and inline facet syntax like
 * `target:TE 3rd-long air raid mesh`. The parse result becomes removable chips
 * so the magic is visible and correctable rather than mysterious.
 */
export function useSearch(
  libraryIndex: PlayIndexEntry[],
  userPlays: Play[],
  variant: FieldVariantId,
) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [scope, setScope] = useState<"library" | "book">("library");

  const userIndex = useMemo(
    () => userPlays.map((p) => buildIndexEntry(p, "book")),
    [userPlays],
  );

  const parsed = useMemo(() => parseQuery(query), [query]);

  const active = useMemo<Filters>(
    () => ({ ...filters, variant: filters.variant ?? variant }),
    [filters, variant],
  );

  const source = scope === "book" ? userIndex : libraryIndex;

  const results = useMemo(
    () => source.filter((e) => matchPlay(e, active, parsed)),
    [source, active, parsed],
  );

  const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => (f[key] === value ? { ...f, [key]: undefined } : { ...f, [key]: value }));
  }, []);

  const clear = useCallback(() => {
    setFilters({});
    setQuery("");
  }, []);

  /** Everything the parser understood, flattened for the chip row. */
  const understood = useMemo(
    () => parsed.terms.flatMap((t) => t.constraints),
    [parsed],
  );

  /** Words that fell through to plain text matching. */
  const freeWords = useMemo(
    () => parsed.terms.flatMap((t) => t.words),
    [parsed],
  );

  const dropConstraint = useCallback((matched: string) => {
    setQuery((q) => withoutConstraint(q, matched));
  }, []);

  const chipCount =
    Object.values(filters).filter((v) => v !== undefined).length +
    Object.keys(parsed.filters).length +
    understood.length;

  return {
    query, setQuery,
    filters, setFilter, clear,
    active, results, scope, setScope,
    userIndex, chipCount,
    understood, freeWords, dropConstraint,
  };
}
