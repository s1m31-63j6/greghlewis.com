"use client";

/**
 * A player's injury designation.
 *
 * The tooltip leads with the injury itself and then says what the designation
 * guarantees about availability under the roster rules — because Sleeper lists
 * a player who has had ACL surgery as "Questionable", and showing that label
 * first would mislead. Sleeper publishes no return date, so none is invented.
 *
 * The letter carries the meaning, not the color: O / D / Q reads the same in
 * grayscale and to a screen reader.
 */

import type { Player } from "@/lib/draft-sheet/types";
import { Tip } from "./Tip";

const LETTER = { out: "O", doubtful: "D", questionable: "Q" } as const;

export function InjuryTag({ injury }: { injury: Player["injury"] }) {
  if (!injury) return <span className="ds-inj-none" aria-hidden="true" />;
  return (
    <Tip label={injury.detail} className={`ds-inj ds-inj--${injury.severity}`}>
      <span aria-hidden="true">{LETTER[injury.severity]}</span>
      <span className="ds-sr">Injury: {injury.detail}</span>
    </Tip>
  );
}
