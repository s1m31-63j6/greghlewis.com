/**
 * The five ideas. Each is a tab in Bond Fundamentals with its own chart,
 * and the episode panel names them by numeral. The note is the only
 * prose an idea gets: two lines at most, in the smallest face.
 */

export type PillarId = "fisher" | "expectations" | "reaction" | "premium" | "neutral";

export interface Pillar {
  id: PillarId;
  numeral: string;
  /** Caption title and the name in the episode panel. */
  name: string;
  /** The tab label. */
  tab: string;
  note: string;
}

export const PILLARS: Pillar[] = [
  {
    id: "fisher",
    numeral: "I",
    name: "Real return plus inflation",
    tab: "Real return + inflation",
    note: "A 10-year paying 5% is not paying 5% in real terms. TIPS pay the real part only; the gap to a normal Treasury is the market's inflation forecast.",
  },
  {
    id: "expectations",
    numeral: "II",
    name: "A bet on the Fed",
    tab: "Bet on the Fed",
    note: "The Fed sets one overnight rate. The market sets every longer rate by guessing where that rate goes next, so the 2-year moves before the Fed does.",
  },
  {
    id: "reaction",
    numeral: "III",
    name: "The Fed's job",
    tab: "The Fed's job",
    note: "Two goals: inflation near 2% and people employed. Inflation too high, raise the rate. Unemployment rising, cut it.",
  },
  {
    id: "premium",
    numeral: "IV",
    name: "Extra pay for waiting",
    tab: "Pay for waiting",
    note: "Lending for ten years is riskier than lending overnight again and again. The extra yield for that risk is the term premium, and it goes below zero when everyone wants safety.",
  },
  {
    id: "neutral",
    numeral: "V",
    name: "The resting rate",
    tab: "Resting rate",
    note: "The rate at which the economy neither speeds up nor slows down. Nobody can see it, only estimate it. It is where the Fed's rate settles once a cycle is over.",
  },
];

export const PILLAR_BY_ID = Object.fromEntries(PILLARS.map((p) => [p.id, p])) as Record<PillarId, Pillar>;
