"use client";

/**
 * Undo, as immutable snapshots of the play document rather than command
 * inversion.
 *
 * A play document is a few kilobytes. At that size snapshots are dramatically
 * less bug-prone than inverse commands, and the memory is irrelevant — a
 * hundred entries is well under a megabyte.
 *
 * COALESCING is what makes it feel right. Consecutive mutations of the same
 * (entity, field) inside half a second merge into one entry, so dragging a
 * player is one undo rather than sixty, and typing a name is one undo rather
 * than one per keystroke.
 *
 * **The history is mutated in the handler, never inside a state updater.**
 * React invokes updaters twice in development to surface impure ones, and an
 * updater that popped the undo stack popped it twice — so undo appeared to do
 * nothing at all. A ref mirrors the current play so every operation can read it
 * without needing an updater to see fresh state.
 */

import { useCallback, useRef, useState } from "react";

import type { Play } from "@/lib/playbook/types";

const LIMIT = 100;
const COALESCE_MS = 500;

interface Entry {
  play: Play;
  label: string;
  key: string | null;
}

export function usePlayHistory(initial: Play) {
  const [play, setPlay] = useState<Play>(initial);
  const current = useRef<Play>(initial);
  const past = useRef<Entry[]>([]);
  const future = useRef<Entry[]>([]);
  const lastKey = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });

  const apply = useCallback((next: Play) => {
    current.current = next;
    setPlay(next);
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);

  const reset = useCallback(
    (next: Play) => {
      past.current = [];
      future.current = [];
      lastKey.current = { key: null, at: 0 };
      apply(next);
    },
    [apply],
  );

  /**
   * @param key  Identifies the (entity, field) being changed. Two commits with
   *             the same key inside the coalesce window become one undo step.
   *             Pass null for anything that should always stand alone.
   */
  const commit = useCallback(
    (next: Play | ((p: Play) => Play), label: string, key: string | null = null) => {
      const before = current.current;
      const resolved = typeof next === "function" ? next(before) : next;
      if (resolved === before) return;

      const now = Date.now();
      const merge =
        key !== null && lastKey.current.key === key && now - lastKey.current.at < COALESCE_MS;

      if (!merge) {
        past.current.push({ play: before, label, key });
        if (past.current.length > LIMIT) past.current.shift();
        future.current = [];
      }
      lastKey.current = { key, at: now };
      apply(resolved);
    },
    [apply],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push({ play: current.current, label: prev.label, key: prev.key });
    lastKey.current = { key: null, at: 0 };
    apply(prev.play);
  }, [apply]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ play: current.current, label: next.label, key: next.key });
    lastKey.current = { key: null, at: 0 };
    apply(next.play);
  }, [apply]);

  /** Ends a coalescing run, so the next change starts a fresh undo entry. */
  const seal = useCallback(() => {
    lastKey.current = { key: null, at: 0 };
  }, []);

  return {
    play,
    commit,
    undo,
    redo,
    reset,
    seal,
    canUndo: depth.undo > 0,
    canRedo: depth.redo > 0,
    dirty: depth.undo > 0,
  };
}
