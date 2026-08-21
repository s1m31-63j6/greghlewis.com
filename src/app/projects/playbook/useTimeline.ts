"use client";

/**
 * The animation clock.
 *
 * requestAnimationFrame, one authoritative `t` in seconds, imperative writes
 * through refs. Not CSS transitions, which cannot be scrubbed at all, and not
 * the Web Animations API — WAAPI can seek, but it would need one Animation per
 * player plus one per route trace, and seeking writes `currentTime` on every
 * one of them anyway, so the off-main-thread advantage evaporates during
 * exactly the interaction that matters.
 *
 * With one clock, SCRUBBING AND PLAYING ARE THE SAME CODE PATH: set `t`, render
 * one frame. Speed is a multiplier on `dt`. There is exactly one place a timing
 * bug can live.
 *
 * **This module knows about time and nothing about geometry.** It used to
 * pre-sample every path in JavaScript, which quietly put the player on a
 * different line from the one being drawn: the trace followed the Bézier and
 * the sampler followed the raw polyline. Geometry now comes from the rendered
 * `<path>` itself, in AnimatedPlay, so the two cannot disagree.
 *
 * Pre-snap motion lives in NEGATIVE time with the snap at zero. One timeline
 * expresses shift, motion, snap and play without a separate pre-snap mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BALL_KEY, pathKey } from "./PlayDiagram";
import type { ResolvedPath, ResolvedPlay } from "@/lib/playbook/types";

export interface Track {
  /** Matches the key PlayDiagram registers its elements under. */
  key: string;
  slot: string;
  role: ResolvedPath["role"];
  phase: ResolvedPath["phase"];
  startSec: number;
  endSec: number;
  priorityOrder: number;
}

export interface Timeline {
  tracks: Track[];
  startSec: number;
  endSec: number;
}

export function buildTimeline(play: ResolvedPlay): Timeline {
  const tracks: Track[] = play.paths.map((p, i) => ({
    key: pathKey(p, i),
    slot: p.slot,
    role: p.role,
    phase: p.phase,
    startSec: p.startDelayMs / 1000,
    endSec: (p.startDelayMs + p.durationMs) / 1000,
    priorityOrder: p.priorityOrder,
  }));

  if (play.ball) {
    tracks.push({
      key: BALL_KEY,
      slot: "ball",
      role: "ball",
      phase: play.ball.phase,
      startSec: play.ball.startDelayMs / 1000,
      endSec: (play.ball.startDelayMs + play.ball.durationMs) / 1000,
      priorityOrder: 0,
    });
  }

  return {
    tracks,
    startSec: Math.min(0, ...tracks.map((t) => t.startSec)),
    endSec: Math.max(1.2, ...tracks.map((t) => t.endSec)),
  };
}

/** How far through its own window a track is at time `t`. */
export function progressAt(track: Track, t: number): number {
  if (t <= track.startSec) return 0;
  if (t >= track.endSec) return 1;
  const span = track.endSec - track.startSec;
  return span <= 0 ? 1 : (t - track.startSec) / span;
}

/**
 * A slot can own more than one track — pre-snap motion, then a route. Pick the
 * one that governs where he is standing right now: the track whose window
 * contains `t`, else the last one that has finished, else the first still to
 * come (so he waits at its start rather than jumping).
 *
 * Without this the glyph was written once per track every frame and last-wins,
 * which put anyone in motion in two places at once.
 */
export function activeTrackFor(tracks: Track[], t: number): Track | null {
  if (tracks.length === 0) return null;
  const live = tracks.find((x) => t >= x.startSec && t <= x.endSec);
  if (live) return live;
  const done = tracks.filter((x) => x.endSec < t);
  if (done.length) return done.reduce((a, b) => (b.endSec > a.endSec ? b : a));
  return tracks.reduce((a, b) => (b.startSec < a.startSec ? b : a));
}

export const SPEEDS = [0.25, 0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export function useTimeline(play: ResolvedPlay) {
  const timeline = useMemo(() => buildTimeline(play), [play]);

  // A play OPENS FINISHED. A coach arriving at a play wants to read it, not
  // press a button to make it appear; ▶ rewinds and animates from there.
  const tRef = useRef(timeline.endSec);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [loop, setLoop] = useState(false);
  // React state updates only the readout, throttled — reconciling twenty-odd
  // nodes at sixty frames a second is precisely what makes a scrub feel rubbery.
  const [display, setDisplay] = useState(timeline.endSec);

  const subscribers = useRef(new Set<(t: number) => void>());
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const lastDisplay = useRef(0);

  const emit = useCallback((t: number) => {
    tRef.current = t;
    for (const fn of subscribers.current) fn(t);
    const now = performance.now();
    if (now - lastDisplay.current > 66) {
      lastDisplay.current = now;
      setDisplay(t);
    }
  }, []);

  const seek = useCallback(
    (t: number) => {
      emit(Math.min(timeline.endSec, Math.max(timeline.startSec, t)));
      setDisplay(tRef.current);
    },
    [emit, timeline.endSec, timeline.startSec],
  );

  // Re-park at the end whenever the play itself changes. The React state is
  // adjusted during render — an effect would show the new play at the old
  // play's clock for one frame — while the clock and the subscribed DOM are
  // synchronised in the effect below, which is what effects are for.
  const [seenTimeline, setSeenTimeline] = useState(timeline);
  if (seenTimeline !== timeline) {
    setSeenTimeline(timeline);
    setPlaying(false);
    setDisplay(timeline.endSec);
  }

  useEffect(() => {
    emit(timeline.endSec);
  }, [timeline, emit]);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    const step = (now: number) => {
      const prev = last.current ?? now;
      last.current = now;
      const dt = ((now - prev) / 1000) * speed;
      let t = tRef.current + dt;
      if (t >= timeline.endSec) {
        if (loop) t = timeline.startSec;
        else {
          emit(timeline.endSec);
          setDisplay(timeline.endSec);
          setPlaying(false);
          return;
        }
      }
      emit(t);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      last.current = null;
    };
  }, [playing, speed, loop, timeline.endSec, timeline.startSec, emit]);

  const subscribe = useCallback((fn: (t: number) => void) => {
    subscribers.current.add(fn);
    fn(tRef.current);
    return () => {
      subscribers.current.delete(fn);
    };
  }, []);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      // Parked at the end, which is where a play starts life. Rewind first.
      if (!p && tRef.current >= timeline.endSec - 0.01) emit(timeline.startSec);
      return !p;
    });
  }, [emit, timeline.endSec, timeline.startSec]);

  const reset = useCallback(() => {
    setPlaying(false);
    seek(timeline.startSec);
  }, [seek, timeline.startSec]);

  /**
   * Under reduced motion the transport steps through event keyframes instead of
   * animating: the snap, then each route's arrival, in order.
   */
  const steps = useMemo(() => {
    const s = new Set<number>([timeline.startSec, 0]);
    for (const t of timeline.tracks) s.add(t.endSec);
    return [...s].sort((a, b) => a - b);
  }, [timeline]);

  const stepForward = useCallback(() => {
    const next = steps.find((s) => s > tRef.current + 0.01);
    seek(next ?? timeline.startSec);
  }, [steps, seek, timeline.startSec]);

  return {
    timeline, subscribe, seek, toggle, reset, stepForward,
    playing, speed, setSpeed, loop, setLoop,
    t: display,
  };
}
