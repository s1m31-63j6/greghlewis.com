"use client";

/**
 * Team identity: names, team colors, and marks.
 *
 * Logos are hotlinked from ESPN's CDN rather than mirrored into the repo — the
 * same choice NFL Prospect Comparables makes for player headshots. `TeamLogo`
 * therefore has to survive the image not arriving, and falls back to the
 * three-letter abbreviation set in the team's own color, which is what the
 * interface used to show everywhere anyway.
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
  color: "#4b5158", color2: "#16181d", logo: null, wordmark: null,
};

export function useTeams(base = "/two-minute-drill"): TeamMap {
  const [teams, setTeams] = useState<TeamMap>({});
  useEffect(() => {
    let live = true;
    fetch(`${base}/teams.json`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setTeams(d.teams as TeamMap);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [base]);
  return teams;
}

export function teamOf(teams: TeamMap, abbr: string | null | undefined): Team {
  if (!abbr) return FALLBACK;
  return teams[abbr] ?? { ...FALLBACK, name: abbr, nick: abbr };
}

/**
 * A team mark at `size` pixels square.
 *
 * `onError` swaps to the abbreviation rather than leaving a broken image, so a
 * bad CDN day degrades to the old appearance instead of a hole in the page.
 */
export function TeamLogo({
  abbr,
  teams,
  size = 28,
  className,
}: {
  abbr: string | null | undefined;
  teams: TeamMap;
  size?: number;
  className?: string;
}) {
  // Remembering *which* team's mark failed rather than a bare boolean means
  // switching teams clears the failure on its own, with no effect to reset it.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = failedFor === abbr;
  const team = teamOf(teams, abbr);

  if (!abbr) return null;

  if (!team.logo || failed) {
    return (
      <span
        className={`tmd-logo-fallback ${className ?? ""}`}
        style={{
          width: size,
          height: size,
          background: team.color,
          fontSize: Math.max(9, Math.round(size * 0.34)),
        }}
        aria-label={team.name || abbr}
      >
        {abbr}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`tmd-logo ${className ?? ""}`}
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
