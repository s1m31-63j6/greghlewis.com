"use client";

import { useEffect, useState } from "react";
import { POSITION_COLORS, type Position } from "./types";

interface Props {
  // Ordered list of candidate URLs. The first one that loads wins; on
  // error we step to the next. Empty list (or all-fail) renders the
  // initials fallback. Order matters — put the verified URL first.
  candidates: string[];
  // Player name for both alt text and the initials fallback.
  name: string;
  position: Position;
  size: 16 | 20;
}

// Small avatar component that walks `candidates` until one loads. The
// existing per-prospect data has at most 1-2 URLs, so this keeps state
// compact (just the active index). On all-fail we render a position-
// colored initial bubble — same fallback as the previous inline code,
// just unified across the single-prospect and compare layouts.
export default function Avatar({ candidates, name, position, size }: Props) {
  const [idx, setIdx] = useState(0);
  // Reset whenever the candidate list changes (new prospect or override
  // arrival). Otherwise switching from a prospect with a working URL to
  // one with a stale URL would keep the failure index from the previous.
  useEffect(() => {
    setIdx(0);
  }, [candidates]);

  const src = candidates[idx];
  const dim = size === 20 ? "w-20 h-20 text-2xl" : "w-16 h-16 text-lg";
  const ringWidth = size === 20 ? 2 : 1.5;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${dim} rounded-full object-cover bg-stone-100`}
        onError={() => setIdx((i) => i + 1)}
      />
    );
  }

  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2);
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-semibold bg-white`}
      style={{
        color: POSITION_COLORS[position],
        boxShadow: `inset 0 0 0 ${ringWidth}px ${POSITION_COLORS[position]}`,
      }}
    >
      {initials}
    </div>
  );
}
