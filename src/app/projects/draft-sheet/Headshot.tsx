"use client";

/**
 * A player's face, hotlinked from ESPN's CDN.
 *
 * Same policy as the team marks: nothing trademarked is mirrored into the repo.
 * Two sources are tried in order — ESPN's headshot, then Yahoo's cutout from the
 * ADP feed — because ESPN's coverage of rookies and late-summer signings lags.
 * When both fail the initials stand in on the team's own color, which is a
 * deliberate design rather than a broken-image icon.
 */

import { useState } from "react";

import { teamOf, type TeamMap } from "./teams";

const ESPN = (id: string) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z .'-]/g, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const last = parts[parts.length - 1];
  return ((parts[0][0] ?? "") + (parts.length > 1 ? last[0] : "")).toUpperCase();
}

export function Headshot({
  name, espnId, fallbackUrl, team, teams, size = 44,
}: {
  name: string;
  espnId: string | null;
  fallbackUrl: string | null;
  team: string | null;
  teams: TeamMap;
  size?: number;
}) {
  const sources = [espnId ? ESPN(espnId) : null, fallbackUrl].filter(Boolean) as string[];
  const [attempt, setAttempt] = useState(0);
  const resolved = teamOf(teams, team);

  if (attempt >= sources.length) {
    return (
      <span
        className="ds-face ds-face--fallback"
        style={{ width: size, height: size, background: resolved.color, fontSize: size * 0.36 }}
        aria-label={name}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="ds-face"
      src={sources[attempt]}
      alt={name}
      width={size}
      height={size}
      style={{ width: size, height: size, background: `${resolved.color}22` }}
      loading="lazy"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}
