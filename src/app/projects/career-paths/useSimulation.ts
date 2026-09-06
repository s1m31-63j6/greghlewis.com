"use client";

import { useMemo } from "react";

import { runCohort } from "./engine/stats.ts";
import type { Career, Params, Persona, Stage, Track3 } from "./engine/types.ts";
import { TRACKS3 } from "./engine/types.ts";

export const N_BALLS = 1000;

export interface TrackRun {
  track: Track3;
  /** Re-simulated only when its own inputs change, so array identity says whether it moved. */
  careers: Career[];
}

export interface SimSettings {
  persona: Persona;
  stage: Stage | null;
  stay: boolean;
  seed: number;
}

export function simulateTrack(track: Track3, P: Params, s: SimSettings): Career[] {
  return runCohort(s.persona, track, P, N_BALLS, {
    stage: track === "startup" ? s.stage : null,
    stay: s.stay,
    seed: (s.seed + (track === "startup" ? 1 : track === "corporate" ? 2 : 3)) >>> 0,
  });
}

/**
 * One thousand careers per first job. The startup cohort alone depends on the
 * stage picker, so a stage change re-runs only that track; the other two keep
 * their array identity and the plinko leaves their balls where they settled.
 */
export function useSimulation(P: Params | null, s: SimSettings): TrackRun[] | null {
  const { persona, stage, stay, seed } = s;
  const startup = useMemo(
    () => (P ? simulateTrack("startup", P, { persona, stage, stay, seed }) : null),
    [P, persona, stage, stay, seed],
  );
  const corporate = useMemo(
    () => (P ? simulateTrack("corporate", P, { persona, stage: null, stay, seed }) : null),
    [P, persona, stay, seed],
  );
  const consulting = useMemo(
    () => (P ? simulateTrack("consulting", P, { persona, stage: null, stay, seed }) : null),
    [P, persona, stay, seed],
  );
  return useMemo(() => {
    if (!startup || !corporate || !consulting) return null;
    const by = { startup, corporate, consulting };
    return TRACKS3.map((t) => ({ track: t, careers: by[t] }));
  }, [startup, corporate, consulting]);
}
