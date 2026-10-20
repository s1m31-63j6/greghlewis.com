/**
 * Fifteen episodes, 2000 to today. Each is a numbered marker on the
 * timeline and a short card: the 10-year's move as the big number, what
 * the Fed did underneath, one or two sentences, and the ideas that
 * explain it. Levels are from the FRED series the chart draws (DGS10,
 * DFF), rounded to a tenth; intraday records are named as such.
 */

import type { PillarId } from "./pillars";

export interface Episode {
  id: string;
  n: string;
  title: string;
  /** ISO dates. The band runs start..end; the marker sits at anchor. */
  start: string;
  end: string;
  anchor: string;
  when: string;
  /** The 10-year's move, e.g. "3.97 → 5.31". */
  big: string;
  /** What the Fed's rate did. */
  sub: string;
  body: string;
  ideas: PillarId[];
}

export const EPISODES: Episode[] = [
  {
    id: "old-normal", n: "01", title: "The old normal",
    start: "2000-01-01", end: "2000-12-31", anchor: "2000-01-21", when: "2000",
    big: "6.8", sub: "Fed funds raised to 6.5",
    body: "The economy was booming and a Treasury paid more than 3% after inflation. Nobody thought that was unusual.",
    ideas: ["neutral", "fisher"],
  },
  {
    id: "dotcom-bust", n: "02", title: "Bust, September 11, and a deflation scare",
    start: "2001-01-03", end: "2003-06-30", anchor: "2003-06-13", when: "2001 to 2003",
    big: "5.1 → 3.1", sub: "Fed funds cut 6.5 → 1.0 in thirteen steps",
    body: "The Fed went to 1%, the lowest since 1958, and promised to stay there for a considerable period. The 10-year took it at its word.",
    ideas: ["reaction", "expectations", "fisher"],
  },
  {
    id: "conundrum", n: "03", title: "Greenspan's conundrum",
    start: "2004-06-30", end: "2006-06-30", anchor: "2005-06-24", when: "2004 to 2006",
    big: "4.7 → 5.2", sub: "Fed funds 1.0 → 5.25 in seventeen steps",
    body: "Seventeen hikes and the 10-year barely moved. China and the oil exporters were buying Treasuries with their savings.",
    ideas: ["premium", "neutral", "expectations"],
  },
  {
    id: "crisis", n: "04", title: "The crisis",
    start: "2007-08-01", end: "2008-12-31", anchor: "2008-12-19", when: "2007 to 2008",
    big: "5.2 → 2.1", sub: "Fed funds 5.25 → 0",
    body: "Sixteen months from the first subprime cracks to a Fed rate of zero. A Treasury was the only thing anyone wanted to own.",
    ideas: ["reaction", "premium", "fisher"],
  },
  {
    id: "zero-and-qe", n: "05", title: "Zero, and then the printing press",
    start: "2009-01-01", end: "2012-12-31", anchor: "2012-06-01", when: "2009 to 2012",
    big: "4.0 → 1.5", sub: "Fed funds pinned near zero",
    body: "Stuck at zero, the Fed bought bonds instead: three rounds of QE and a promise to hold rates down until mid-2013.",
    ideas: ["expectations", "premium", "neutral"],
  },
  {
    id: "taper-tantrum", n: "06", title: "The taper tantrum",
    start: "2013-05-01", end: "2013-12-31", anchor: "2013-09-06", when: "2013",
    big: "1.7 → 3.0", sub: "Fed funds unchanged at 0.1",
    body: "Bernanke said the Fed might slow its bond buying. The 10-year jumped more than a point in four months before anything changed.",
    ideas: ["premium", "expectations"],
  },
  {
    id: "lower-for-longer", n: "07", title: "Lower for longer",
    start: "2014-01-01", end: "2016-11-08", anchor: "2016-07-08", when: "2014 to 2016",
    big: "3.0 → 1.4", sub: "Fed funds lifted once, to 0.4",
    body: "Oil halved, yields abroad went below zero, and after the Brexit vote the 10-year hit 1.37%, its lowest ever.",
    ideas: ["neutral", "fisher", "premium"],
  },
  {
    id: "normalization", n: "08", title: "Normalization",
    start: "2017-01-01", end: "2018-12-31", anchor: "2018-10-05", when: "2017 to 2018",
    big: "2.4 → 3.2", sub: "Fed funds 0.6 → 2.4",
    body: "Seven hikes in two years. Powell said rates were a long way from neutral; stocks fell 20% and he took it back.",
    ideas: ["reaction", "expectations", "neutral"],
  },
  {
    id: "pivot-inversion", n: "09", title: "The pivot and the inversion",
    start: "2019-01-01", end: "2019-12-31", anchor: "2019-08-30", when: "2019",
    big: "2.7 → 1.5", sub: "Fed funds cut 2.4 → 1.55",
    body: "The 10-year paid less than the overnight rate: the market expected cuts during a trade war. It got three.",
    ideas: ["expectations", "reaction"],
  },
  {
    id: "covid", n: "10", title: "The floor",
    start: "2020-02-20", end: "2020-12-31", anchor: "2020-07-31", when: "2020",
    big: "1.8 → 0.5", sub: "Fed funds cut to 0.05 in twelve days",
    body: "Two emergency cuts to zero, then unlimited bond buying. After inflation, lenders lost about 1% a year to hold a Treasury.",
    ideas: ["reaction", "premium", "fisher"],
  },
  {
    id: "inflation-returns", n: "11", title: "Inflation returns",
    start: "2021-01-01", end: "2022-12-31", anchor: "2022-10-21", when: "2021 to 2022",
    big: "0.9 → 4.2", sub: "Fed funds 0.1 → 4.3 in nine months",
    body: "Prices rose 9.1% in a year after the Fed called inflation transitory. The fastest hikes since the early 1980s followed.",
    ideas: ["fisher", "reaction", "expectations"],
  },
  {
    id: "higher-for-longer", n: "12", title: "Higher for longer",
    start: "2023-01-01", end: "2023-12-31", anchor: "2023-10-20", when: "2023",
    big: "3.4 → 5.0", sub: "Fed funds 4.3 → 5.3, last hike in July",
    body: "The Fed stopped hiking in July, yet the 10-year reached 5% in October as the Treasury announced bigger auctions.",
    ideas: ["premium", "expectations", "reaction"],
  },
  {
    id: "cuts-long-end-rises", n: "13", title: "The Fed cuts, and the 10-year rises",
    start: "2024-01-01", end: "2024-12-31", anchor: "2024-12-27", when: "2024",
    big: "3.7 → 4.6", sub: "Fed funds cut 5.3 → 4.3",
    body: "The Fed cut a full point and the 10-year rose a full point: a strong economy, a 6% deficit, and no Fed buying.",
    ideas: ["expectations", "premium", "neutral"],
  },
  {
    id: "tariffs-2025", n: "14", title: "Tariffs, a downgrade, and three more cuts",
    start: "2025-01-01", end: "2025-12-31", anchor: "2025-04-11", when: "2025",
    big: "4.0 → 4.5", sub: "In one week in April. Fed funds cut to 3.6 by December",
    body: "Tariffs on April 2 sent bonds down with stocks as leveraged funds unwound. Moody's removed the last AAA rating in May.",
    ideas: ["premium", "reaction", "expectations"],
  },
  {
    id: "five-percent-2026", n: "15", title: "Five percent again",
    start: "2026-01-01", end: "2026-10-15", anchor: "2026-10-02", when: "2026",
    big: "3.97 → 5.31", sub: "Fed funds raised to 3.75–4.00",
    body: "Oil crossed $100 and the Fed raised rates for the first time since 2023. Almost all of the rise since February was real return.",
    ideas: ["fisher", "premium", "neutral", "reaction", "expectations"],
  },
];
