"use client";

/**
 * Tool icons.
 *
 * Hand-drawn rather than pulled from a library, for the same reason everything
 * else here is: this repo has no icon package and does not need one for six
 * glyphs. Each is a 16-unit square at 1.6 stroke, drawn in `currentColor` so
 * the active state colours the icon and its caption together.
 *
 * Each one says what the tool DRAWS: the route icon breaks and arrows, the
 * block icon ends in a flat bar, the motion icon zigzags. A coach who knows the
 * diagram grammar can read the rail without reading the captions.
 */

import type { ReactNode } from "react";

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export function SelectIcon() {
  return (
    <Frame>
      <path {...S} d="M3.5 2.4 L12 8.6 L8.1 9.2 L10 13.4 L8.2 14.1 L6.4 9.9 L3.5 12.2 Z" />
    </Frame>
  );
}

/** A stem, a break, and an arrowhead — a route. */
export function RouteIcon() {
  return (
    <Frame>
      <path {...S} d="M3.5 14 L3.5 6.5 L11 6.5" />
      <path {...S} d="M8.8 4 L11.8 6.5 L8.8 9" />
    </Frame>
  );
}

/** A stem into a flat bar — a block. */
export function BlockIcon() {
  return (
    <Frame>
      <path {...S} d="M8 14 L8 5.4" />
      <path {...S} d="M3.6 5.4 L12.4 5.4" />
    </Frame>
  );
}

/** A zigzag — pre-snap motion. */
export function MotionIcon() {
  return (
    <Frame>
      <path {...S} d="M2 11 L4.6 6.4 L7.2 11 L9.8 6.4 L12.4 11" />
      <path {...S} d="M11.4 4.2 L14 6.2 L11.4 8.2" />
    </Frame>
  );
}

export function EraseIcon() {
  return (
    <Frame>
      <path {...S} d="M2.8 12.6 L8.4 3.6 A1.6 1.6 0 0 1 10.7 3.2 L13 5.2 A1.6 1.6 0 0 1 13.1 7.5 L9.6 12.6 Z" />
      <path {...S} d="M2.4 13.4 L13.6 13.4" />
    </Frame>
  );
}

/** A magnifier over the box — the lineman detail view. */
export function LinemanIcon() {
  return (
    <Frame>
      <circle {...S} cx={7} cy={7} r={4.2} />
      <path {...S} d="M10.2 10.2 L14 14" />
      <path {...S} d="M5.2 7 L8.8 7" />
    </Frame>
  );
}
