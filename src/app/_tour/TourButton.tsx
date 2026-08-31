"use client";

/**
 * Replays the tour on demand.
 *
 * Renders nothing until a <Tour> has registered, so a page can carry the button
 * unconditionally and a page without a tour simply shows no button.
 */

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, startTour, subscribe } from "./tourStore";

export default function TourButton({
  label = "Take the tour",
  className,
}: {
  label?: string;
  /** Replaces the default styling entirely, for chrome with its own button class. */
  className?: string;
}) {
  const ready = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!ready) return null;

  return (
    <button
      type="button"
      className={className ?? "tour-launch"}
      onClick={startTour}
      data-tel="tour-open"
    >
      {label}
    </button>
  );
}
