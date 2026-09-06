"use client";

/**
 * The choose-your-own state machine.
 *
 * A run is (persona, seed) plus the reader's choices so far. Everything else
 * is derived: one `simulate` call with the choices pinned gives the career,
 * and we only read it up to the milestone the reader has reached. Years past
 * that milestone are simulated too, but the engine's rng stream only diverges
 * from the pinned path at the next choice, so what the reader has already
 * seen never changes when they choose again.
 *
 *   start ──pick first job──▶ (forced? ──Continue──▶) choose ──pick──▶ … ──▶ done
 */

import { useCallback, useMemo, useState } from "react";

import {
  avgFirst, blockForced, demand, legalChoices, milestoneNodes, simulate,
} from "./engine/engine.ts";
import { mulberry32 } from "./engine/rng.ts";
import type { Career, EventKind, NodeKey, Persona, Track, Track3 } from "./engine/types.ts";
import { fmtDollars } from "./format";
import { NODE_COLOR } from "./sankeyLayout";
import type { Model } from "./useModel";

export type Status = "start" | "forced" | "choose" | "done";

export interface Option { id: string; label: string; color: string }

export interface ForcedEvent { kind: EventKind; year: number; amount: number; label: string }

export interface AdventureView {
  status: Status;
  /** Milestones reached so far; the current band is `step + 1` (band 0 is year 0). */
  step: number;
  year: number;
  career: Career | null;
  /** Node ids on the reader's path, year 0 first. */
  pathIds: string[];
  /** For each step of the path, whether the block held a forced event. */
  pathForced: boolean[];
  nodeKey: NodeKey | null;
  track: Track | null;
  level: number;
  forced: ForcedEvent | null;
  options: Option[];
  pay: number;
  avg: number;
  lifetime: number;
  crowdLifetime: number | null;
  demand: [number, number];
}

export interface AdventureActions {
  pickFirst: (t: Track3) => void;
  choose: (id: string) => void;
  acknowledge: () => void;
}

const FIRST_LABEL: Record<Track3, string> = {
  startup: "Join a startup",
  corporate: "Take a corporate job",
  consulting: "Go into consulting",
};

export function firstOptions(): Option[] {
  return (["startup", "corporate", "consulting"] as Track3[]).map((t) => ({
    id: t, label: FIRST_LABEL[t], color: NODE_COLOR[t],
  }));
}

function choiceOption(id: string, track: Track): Option {
  if (id === "stay") {
    return { id, label: track === "gradschool" ? "Finish the MBA" : "Stay", color: NODE_COLOR[track] };
  }
  if (id.startsWith("switch:")) {
    const t = id.split(":")[1] as Track3;
    const label = { corporate: "Move to a corporate job", consulting: "Move to consulting", startup: "Join a startup" }[t];
    return { id, label, color: NODE_COLOR[t] };
  }
  if (id.startsWith("mba:")) {
    const t = id.slice(4) as Track3;
    const then = { corporate: "corporate", consulting: "consulting", startup: "a startup" }[t];
    return { id, label: `Get an MBA, then ${then}`, color: NODE_COLOR.mba };
  }
  return { id, label: "Found a company", color: NODE_COLOR.founder };
}

function forcedIn(career: Career, kind: EventKind, from: number, to: number, founder: boolean): ForcedEvent {
  const inBlock = career.events.filter((e) => from < e.year && e.year <= to);
  const year = inBlock.find((e) => e.kind === kind)?.year ?? to;
  const amount = inBlock
    .filter((e) => e.kind === "exit" || e.kind === "tender")
    .reduce((t, e) => t + e.amount, 0);
  const label = {
    fail: `Your ${founder ? "company" : "startup"} shut down in year ${year}`,
    layoff: `Laid off in year ${year}`,
    counseled: `Counseled out of consulting in year ${year}`,
    exit: amount >= 1
      ? `Your company was acquired in year ${year}: ${fmtDollars(amount)}`
      : `Your company was acquired in year ${year}, and your shares were worth nothing`,
  }[kind as "fail" | "layoff" | "counseled" | "exit"];
  return { kind, year, amount, label };
}

export function useAdventure(model: Model, persona: Persona, seed: number): [AdventureView, AdventureActions] {
  const [first, setFirst] = useState<Track3 | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [acked, setAcked] = useState(false);

  const P = model.params;
  const flows = model.flows[persona];
  const milestones = P.milestones;

  const career = useMemo(() => {
    if (!first) return null;
    const pinned: Record<number, string> = {};
    choices.forEach((c, i) => { pinned[milestones[i]] = c; });
    return simulate(persona, first, P, mulberry32(seed), { pinned });
  }, [first, choices, persona, P, seed, milestones]);

  const view = useMemo<AdventureView>(() => {
    const empty: AdventureView = {
      status: "start", step: -1, year: 0, career: null, pathIds: [], pathForced: [], nodeKey: null, track: null, level: 0,
      forced: null, options: firstOptions(), pay: 0, avg: 0, lifetime: 0, crowdLifetime: null, demand: [0, 0],
    };
    if (!career || !first) return empty;

    const step = choices.length;
    const year = milestones[step];
    const keys = milestoneNodes(career, P);
    const forcedKinds = blockForced(career, P);
    const track = career.milestoneTrack[step];
    const level = career.milestoneLevel[step];
    const nodeKey = keys[step];
    const last = step === milestones.length - 1;

    const kind = forcedKinds[step];
    const founder = choices[step - 1] === "found" || career.milestoneTrack[step - 1] === "founder";
    const forced = kind ? forcedIn(career, kind, step === 0 ? 0 : milestones[step - 1], year, founder) : null;
    const status: Status = last ? "done" : forced && !acked ? "forced" : "choose";

    const options = status === "choose"
      ? legalChoices(track, year + 1).map((id) => choiceOption(id, track))
      : [];

    return {
      status, step, year, career,
      pathIds: [`0:${first}`, ...keys.slice(0, step + 1).map((k, i) => `${milestones[i]}:${k}`)],
      pathForced: forcedKinds.slice(0, step + 1).map((k) => k !== null),
      nodeKey, track, level, forced, options,
      pay: career.realized[year - 1],
      avg: avgFirst(career, year),
      lifetime: career.realized.slice(0, year).reduce((t, x) => t + x, 0),
      crowdLifetime: flows.nodes[`${year}:${nodeKey}`]?.medLtv ?? null,
      demand: demand(track, Math.min(level, 4), P),
    };
  }, [career, first, choices, acked, milestones, P, flows]);

  const pickFirst = useCallback((t: Track3) => { setFirst(t); setChoices([]); setAcked(false); }, []);
  const choose = useCallback((id: string) => { setChoices((c) => [...c, id]); setAcked(false); }, []);
  const acknowledge = useCallback(() => setAcked(true), []);

  return [view, { pickFirst, choose, acknowledge }];
}
