"use client";

/**
 * The drill's state machine, including the branch-on-divergence rule.
 *
 * While your calls match what the coach actually did, the real game plays out —
 * the real yardage, the real clock, the real result. The first time you call
 * something different, history stops and the simulator takes over for the rest
 * of the game. That means a scenario you play "correctly" reads as a replay,
 * and the moment you depart from it you own everything that follows.
 *
 * Decisions are an append-only log rather than something re-derived from a seed,
 * because outcomes are sampled: replaying the log would resample and quietly
 * rewrite history the player already watched. Taking a decision back pops the
 * log, which is exactly the semantics you want.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Action, Evaluation, GameState, Outcome } from "./engine/types";
import { PLAY } from "./engine/types";
import {
  loadPlays, realChoiceFor, type RealPlay, type Scenario, stateAtPlay, startState,
} from "./scenarios";

export type Side = "offense" | "defense";

export interface Decision {
  /** State the decision was made from. */
  before: GameState;
  side: Side;
  action: Action;
  /** Every option the engine weighed, best first. */
  evals: Evaluation[];
  after: GameState;
  outcome: Outcome | null;
  /** When the play was the opponent's, which play they ran. */
  offenseAction: Action | null;
  /** True while we were still replaying the real game. */
  fromHistory: boolean;
  /** What actually happened on this snap, when we know. */
  realDesc: string | null;
  realAction: string | null;
}

export type Status = "loading" | "ready" | "thinking" | "playing" | "over";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

const ROLLOUTS = 2500;

export function useDrill(scenario: Scenario | null, userTeam: string | null, season: number) {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const idRef = useRef(1);
  const seedRef = useRef(1);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plays, setPlays] = useState<Record<string, RealPlay[]> | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  // `advancing` covers resolving a chosen play, which happens in an event
  // handler. Whether a search is in flight is derived rather than stored: it is
  // simply "we have no ranking for the state we are looking at", which avoids
  // setting state synchronously inside an effect.
  const [advancing, setAdvancing] = useState(false);
  // Keyed by the state it describes, so a stale ranking is never shown against
  // a new situation and nothing has to be cleared synchronously in an effect.
  const [evalCache, setEvalCache] = useState<{ key: string; evals: Evaluation[] } | null>(null);
  /** How far into the real sequence we still are; null once diverged. */
  const [histIndex, setHistIndex] = useState<number | null>(0);

  // -- worker plumbing -----------------------------------------------------

  useEffect(() => {
    const w = new Worker(new URL("./engine/worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; error?: string }>) => {
      const p = pendingRef.current.get(e.data.id);
      if (!p) return;
      pendingRef.current.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data);
      else p.reject(new Error(e.data.error ?? "engine error"));
    };
    const id = idRef.current++;
    new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      w.postMessage({ id, kind: "init", base: "/two-minute-drill" });
    })
      .then(() => setReady(true))
      .catch((err: Error) => setError(err.message));
    return () => w.terminate();
  }, []);

  const call = useCallback(<T,>(msg: Record<string, unknown>): Promise<T> => {
    const w = workerRef.current;
    if (!w) return Promise.reject(new Error("engine not started"));
    const id = idRef.current++;
    return new Promise<T>((resolve, reject) => {
      pendingRef.current.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ ...msg, id });
    });
  }, []);

  // -- scenario loading ----------------------------------------------------

  useEffect(() => {
    if (!scenario || plays) return;
    loadPlays().then(setPlays).catch((e: Error) => setError(e.message));
  }, [scenario, plays]);

  const sequence = useMemo(
    () => (scenario && plays ? (plays[scenario.id] ?? null) : null),
    [scenario, plays],
  );

  const state: GameState | null = useMemo(() => {
    if (!scenario || !userTeam) return null;
    return decisions.length ? decisions[decisions.length - 1].after : startState(scenario, userTeam);
  }, [scenario, userTeam, decisions]);

  const side: Side = state?.offenseIsUser ? "offense" : "defense";
  const over = !!state && state.seconds <= 0 && state.phase === PLAY;

  // -- ask the engine to rank the options at the current state -------------

  const stateKey = useMemo(
    () => (state ? `${season}|${side}|${JSON.stringify(state)}` : ""),
    [state, side, season],
  );

  useEffect(() => {
    if (!ready || !state || over || !scenario) return;
    let cancelled = false;
    call<{ evals: Evaluation[] }>({
      kind: "evaluate", state, side, n: ROLLOUTS, seed: seedRef.current, season,
    })
      .then((r) => {
        if (cancelled) return;
        setEvalCache({ key: stateKey, evals: r.evals });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, state, side, over, season, scenario, call, stateKey]);

  const evals = evalCache && evalCache.key === stateKey ? evalCache.evals : null;
  const thinking = advancing || (ready && !!state && !over && evals === null);

  // -- the branch-on-divergence rule ---------------------------------------

  /**
   * The recorded play we are standing on, if we are still replaying history
   * and the recorded state still matches where the game actually is.
   */
  const currentReal: RealPlay | null = useMemo(() => {
    if (histIndex === null || !sequence || !state || !userTeam) return null;
    const p = sequence[histIndex];
    if (!p) return null;
    // Only treat it as live history if the recorded situation still lines up.
    // Anything else means the simulator has moved the game somewhere the
    // transcript does not describe.
    const s = stateAtPlay(p, userTeam);
    const matches =
      s.phase === state.phase &&
      s.seconds === state.seconds &&
      s.yardline === state.yardline &&
      s.down === state.down &&
      s.diff === state.diff;
    return matches ? p : null;
  }, [histIndex, sequence, state, userTeam]);

  const decide = useCallback(
    async (action: Action) => {
      if (!state || !scenario || !userTeam) return;
      const evalsNow = evals ?? [];
      const seed = seedRef.current++;

      // Still on the rails, and this is the call that was actually made. On
      // defense that means matching whether the real defense spent a timeout,
      // not matching the opposing offense's play.
      const onRails =
        currentReal !== null && realChoiceFor(side, currentReal, userTeam) === action;
      if (onRails && currentReal && sequence && histIndex !== null) {
        const next = sequence[histIndex + 1];
        // Running out of recorded plays means the game ended there.
        const after: GameState = next
          ? stateAtPlay(next, userTeam)
          : { ...state, seconds: 0, phase: PLAY };
        setDecisions((d) => [
          ...d,
          {
            before: state, side, action, evals: evalsNow, after,
            outcome: currentReal.outcome as Outcome,
            offenseAction: currentReal.action as Action,
            fromHistory: true,
            realDesc: currentReal.desc,
            realAction: currentReal.action,
          },
        ]);
        setHistIndex(histIndex + 1);
        return;
      }

      // Diverged — or never was on the rails. The simulator owns it now.
      setAdvancing(true);
      try {
        const r = await call<{
          state: GameState; outcome: Outcome | null; offenseAction: Action | null;
        }>({ kind: "advance", state, action, side, seed, season });
        setDecisions((d) => [
          ...d,
          {
            before: state, side, action, evals: evalsNow, after: r.state,
            outcome: r.outcome, offenseAction: r.offenseAction, fromHistory: false,
            realDesc: currentReal?.desc ?? null,
            realAction: currentReal?.action ?? null,
          },
        ]);
        setHistIndex(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setAdvancing(false);
      }
    },
    [state, scenario, userTeam, evals, currentReal, sequence, histIndex, side, season, call],
  );

  const undo = useCallback(() => {
    setDecisions((d) => {
      if (!d.length) return d;
      const next = d.slice(0, -1);
      // Rewinding onto a decision that came from history puts us back on the
      // rails at that point; rewinding onto a simulated one leaves us off them.
      const last = next[next.length - 1];
      setHistIndex(!next.length ? 0 : last.fromHistory ? next.length : null);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setDecisions([]);
    setHistIndex(0);
  }, []);

  return {
    state, side, evals, decisions, thinking, over, ready, error,
    sequence, currentReal, diverged: histIndex === null,
    decide, undo, reset,
  };
}
