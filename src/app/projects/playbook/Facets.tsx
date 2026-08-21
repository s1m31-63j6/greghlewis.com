"use client";

/**
 * The facet rail. Permanently on screen rather than behind a button — filtering
 * is a browse activity, and hiding it turns browsing into a modal chore.
 *
 * Counts come from the CURRENT result set, so a coach can see that narrowing to
 * third-and-long leaves four Air Raid plays before clicking.
 */

import { facetCounts, TARGET_LABELS } from "@/lib/playbook/search";
import type {
  Filters,
  PlayFamily,
  PlayIndexEntry,
  PhilosophyId,
  SituationTag,
  TargetRole,
} from "@/lib/playbook/types";

interface Props {
  entries: PlayIndexEntry[];
  filters: Filters;
  onSet: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
}

const PHILOSOPHY_LABEL: Record<string, string> = {
  "air-raid": "Air Raid",
  "power-gap": "Power / gap",
  "zone-run": "Zone run",
  "pro-west-coast": "Pro / West Coast",
  "spread-rpo": "Spread / RPO",
  flexbone: "Flexbone option",
  "wing-t": "Wing-T",
  flag: "Flag 5v5",
  "defense-front": "Fronts",
  "defense-coverage": "Coverages",
  "defense-pressure": "Pressures",
};

const FAMILY_LABEL: Record<string, string> = {
  run: "Run", pass: "Pass", rpo: "RPO", screen: "Screen",
  "play-action": "Play action", option: "Option", trick: "Trick",
  front: "Front", coverage: "Coverage", pressure: "Pressure",
};

/** Grouped the way a call sheet is, because that is how a coach thinks. */
const SITUATION_GROUPS: { label: string; tags: SituationTag[] }[] = [
  {
    label: "Down & distance",
    tags: ["1st-down", "2nd-short", "2nd-long", "3rd-short", "3rd-medium", "3rd-long", "4th-short", "short-yardage"],
  },
  {
    label: "Field zone",
    tags: ["backed-up", "own-territory", "midfield", "plus-territory", "red-zone", "goal-line", "no-run-zone", "sideline"],
  },
  {
    label: "Game state",
    tags: ["two-minute", "four-minute", "must-score", "opening-script", "after-turnover"],
  },
  {
    label: "Beats",
    tags: ["vs-cover-0", "vs-cover-1", "vs-cover-2", "vs-cover-3", "vs-cover-4", "vs-cover-6", "vs-man", "vs-zone", "blitz-beater"],
  },
];

function Group<T extends string>({
  title, values, counts, active, onPick, labels,
}: {
  title: string;
  values: T[];
  counts: Map<string, number>;
  active: T | undefined;
  onPick: (v: T) => void;
  labels?: Record<string, string>;
}) {
  const visible = values.filter((v) => (counts.get(v) ?? 0) > 0 || active === v);
  if (!visible.length) return null;
  return (
    <div className="pb-facet-group">
      <h4 className="pb-label">{title}</h4>
      <ul>
        {visible.map((v) => (
          <li key={v}>
            <button
              className="pb-facet"
              aria-pressed={active === v}
              onClick={() => onPick(v)}
              data-tel="pb-facet"
              data-tel-project="playbook"
            >
              <span>{labels?.[v] ?? v.replace(/-/g, " ")}</span>
              <span className="pb-num pb-facet-count">{counts.get(v) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Facets({ entries, filters, onSet }: Props) {
  const philosophies = facetCounts(entries, "philosophy");
  const types = facetCounts(entries, "type");
  const situations = facetCounts(entries, "situations");
  const targets = facetCounts(entries, "target");
  const formations = facetCounts(entries, "formation");

  return (
    <div className="pb-facets">
      <Group
        title="Philosophy"
        values={Object.keys(PHILOSOPHY_LABEL) as PhilosophyId[]}
        counts={philosophies}
        active={filters.philosophy}
        onPick={(v) => onSet("philosophy", v)}
        labels={PHILOSOPHY_LABEL}
      />
      <Group
        title="Play type"
        values={Object.keys(FAMILY_LABEL) as PlayFamily[]}
        counts={types}
        active={filters.type}
        onPick={(v) => onSet("type", v)}
        labels={FAMILY_LABEL}
      />
      <Group
        title="Intended target"
        values={Object.keys(TARGET_LABELS) as TargetRole[]}
        counts={targets}
        active={filters.target}
        onPick={(v) => onSet("target", v)}
        labels={TARGET_LABELS}
      />
      {SITUATION_GROUPS.map((g) => (
        <Group
          key={g.label}
          title={g.label}
          values={g.tags}
          counts={situations}
          active={filters.situation}
          onPick={(v) => onSet("situation", v)}
        />
      ))}
      <Group
        title="Formation"
        values={[...formations.keys()].sort()}
        counts={formations}
        active={filters.formation}
        onPick={(v) => onSet("formation", v)}
      />
    </div>
  );
}
