"use client";

import { useMemo } from "react";

import { components } from "@/lib/start-sit/scoring";
import { simulate } from "@/lib/start-sit/simulate";
import type { Game, Player, Scoring } from "@/lib/start-sit/types";
import { verdict as makeVerdict } from "@/lib/start-sit/verdict";
import { PlayerCard } from "./PlayerCard";
import { PointsKey } from "./PointsBar";
import { RangeChart } from "./RangeChart";
import { VerdictBanner } from "./VerdictBanner";
import type { TeamMap } from "./teams";
import { useMediaQuery } from "./useMediaQuery";

export function Advisor({
  selected, scoring, games, teams,
}: {
  selected: Player[];
  scoring: Scoring;
  games: Map<string, Game>;
  teams: TeamMap;
}) {
  const compact = useMediaQuery("(max-width: 620px)");
  const priced = useMemo(() => selected.filter((p) => Object.keys(p.stats).length > 0), [selected]);
  const verdict = useMemo(() => makeVerdict(selected, scoring), [selected, scoring]);
  const sim = useMemo(() => (priced.length ? simulate(priced, scoring) : null), [priced, scoring]);
  const breakdowns = useMemo(
    () => new Map(priced.map((p) => [p.id, components(p, scoring)])),
    [priced, scoring],
  );
  const scale = Math.max(12, ...priced.map((p) => breakdowns.get(p.id)!.mean + 2));

  const rows = priced.map((p, i) => ({ player: p, mean: breakdowns.get(p.id)!.mean, sim: sim!.results[i] }))
    .sort((a, b) => b.mean - a.mean);

  return (
    <section className="ss-advisor" aria-label="Verdict">
      <VerdictBanner selected={selected} verdict={verdict} sim={sim} simOrder={priced.map((p) => p.id)} scoring={scoring} />
      {rows.length >= 2 && <RangeChart rows={rows} best={verdict.best} tied={verdict.tied} compact={compact} />}
      {priced.length > 0 && <PointsKey />}
      <div className="ss-cards">
        {selected.map((p) => {
          const i = priced.indexOf(p);
          const state = p.id === verdict.best ? "best"
            : verdict.tied.includes(p.id) ? "tied"
            : i < 0 ? "out" : "rest";
          return (
            <PlayerCard
              key={p.id}
              player={p}
              breakdown={breakdowns.get(p.id) ?? null}
              sim={i >= 0 && sim ? sim.results[i] : null}
              games={games}
              teams={teams}
              scale={scale}
              state={state}
            />
          );
        })}
      </div>
    </section>
  );
}
