"use client";

/**
 * Team identity: names, colors and official marks.
 *
 * Logos are hotlinked from ESPN's CDN rather than mirrored into the repo — the
 * same choice Two-Minute Drill and NFL Prospect Comparables make. It keeps
 * trademarked artwork out of the repository and costs nothing in bundle size.
 * The tradeoff is a runtime dependency on ESPN, so `TeamLogo` has to survive the
 * image not arriving and falls back to the team abbreviation in the team's own
 * color.
 */

import { useEffect, useState } from "react";

export interface Team {
  name: string;
  nick: string;
  conf: string | null;
  div: string | null;
  color: string;
  color2: string;
  logo: string | null;
  wordmark: string | null;
}

export type TeamMap = Record<string, Team>;

const FALLBACK: Team = {
  name: "", nick: "", conf: null, div: null,
  color: "#6b7079", color2: "#16181d", logo: null, wordmark: null,
};

export function useTeams(base = "/draft-sheet"): TeamMap {
  const [teams, setTeams] = useState<TeamMap>({});
  useEffect(() => {
    let live = true;
    fetch(`${base}/teams.json`)
      .then((r) => r.json())
      .then((d) => { if (live) setTeams(d.teams as TeamMap); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [base]);
  return teams;
}

export function teamOf(teams: TeamMap, abbr: string | null | undefined): Team {
  if (!abbr) return FALLBACK;
  return teams[abbr] ?? { ...FALLBACK, name: abbr, nick: abbr };
}

/**
 * A team mark at `size` pixels square. Remembering WHICH team's mark failed
 * rather than a bare boolean means switching teams clears the failure on its
 * own, with no effect to reset it.
 */
export function TeamLogo({
  abbr, teams, size = 18, className,
}: {
  abbr: string | null | undefined;
  teams: TeamMap;
  size?: number;
  className?: string;
}) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const team = teamOf(teams, abbr);
  if (!abbr) return null;

  if (!team.logo || failedFor === abbr) {
    return (
      <span
        className={`ds-logo-fallback ${className ?? ""}`}
        style={{ width: size, height: size, background: team.color,
                 fontSize: Math.max(7, Math.round(size * 0.42)) }}
        aria-label={team.name || abbr}
      >
        {abbr}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`ds-logo ${className ?? ""}`}
      src={team.logo}
      alt={team.name || abbr}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setFailedFor(abbr)}
    />
  );
}
