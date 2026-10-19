/**
 * Fifteen episodes, 2000 to today. Each one is a band on the timeline, a
 * numbered marker at its anchor date, and a card that names which of the
 * five ideas explain it, in plain language. Levels are from the FRED
 * series the chart draws (DGS10, DFF), rounded to a tenth; intraday
 * records are named as such in the text.
 */

import type { PillarId } from "./pillars";

export interface Force {
  pillar: PillarId;
  note: string;
}

export interface Episode {
  id: string;
  n: string;
  title: string;
  /** ISO dates. The band runs start..end; the marker sits at anchor. */
  start: string;
  end: string;
  anchor: string;
  when: string;
  levels: string;
  body: string[];
  forces: Force[];
}

export const EPISODES: Episode[] = [
  {
    id: "old-normal",
    n: "01",
    title: "The old normal",
    start: "2000-01-01",
    end: "2000-12-31",
    anchor: "2000-01-21",
    when: "2000",
    levels: "10-year 6.8% · Fed funds raised to 6.5% in May",
    body: [
      "The chart starts with the 10-year near 7% and the Fed raising its rate to 6.5% to cool a hot economy. Inflation was about 3.4%, so a Treasury paid more than 3% after inflation. Nobody thought that was unusual: the economy was booming and the resting rate was high.",
      "This is the level the 10-year would not see again for twenty-six years.",
    ],
    forces: [
      { pillar: "neutral", note: "The resting rate was high, near 3%, so high yields were normal." },
      { pillar: "fisher", note: "Most of the 7% was real return. Inflation was modest." },
    ],
  },
  {
    id: "dotcom-bust",
    n: "02",
    title: "Bust, September 11, and a deflation scare",
    start: "2001-01-03",
    end: "2003-06-30",
    anchor: "2003-06-13",
    when: "2001 to mid-2003",
    levels: "Fed funds 6.5% → 1.0% · 10-year 5.1% → 3.1%",
    body: [
      "The Fed cut thirteen times, taking its rate from 6.5% to 1% by June 2003, the lowest since 1958. The 10-year fell to 3.1%. The Fed said rates would stay low for a \"considerable period\", and the market took it at its word.",
      "The 10-year did not fall because the Fed cut. It fell because the Fed promised to keep cutting.",
    ],
    forces: [
      { pillar: "reaction", note: "Unemployment rose and inflation fell, so the Fed's job said cut." },
      { pillar: "expectations", note: "\"Considerable period\" told the market where the Fed's rate was going, and the 10-year priced it in." },
      { pillar: "fisher", note: "Talk of deflation shrank the inflation part of every yield." },
    ],
  },
  {
    id: "conundrum",
    n: "03",
    title: "Greenspan's conundrum",
    start: "2004-06-30",
    end: "2006-06-30",
    anchor: "2005-06-24",
    when: "Mid-2004 to mid-2006",
    levels: "Fed funds 1.0% → 5.25% in 17 steps · 10-year 4.7% → 3.9% → 5.2%",
    body: [
      "The Fed raised its rate 17 times, from 1% to 5.25%. The 10-year barely moved and even dipped below 4% halfway through. Greenspan called it a conundrum. Bernanke explained it: China and the oil exporters had huge savings and were buying Treasuries with them.",
      "So long-term borrowing stayed cheap, mortgages included, while the Fed thought it was tightening.",
    ],
    forces: [
      { pillar: "premium", note: "Foreign buyers wanted Treasuries faster than the government sold them, so the extra pay for waiting shrank to nothing." },
      { pillar: "neutral", note: "A world with too much savings and too few places to invest has a low resting rate." },
      { pillar: "expectations", note: "Every hike was announced in advance (\"measured pace\"), so none of them surprised the market." },
    ],
  },
  {
    id: "crisis",
    n: "04",
    title: "The crisis",
    start: "2007-08-01",
    end: "2008-12-31",
    anchor: "2008-12-19",
    when: "August 2007 to December 2008",
    levels: "Fed funds 5.25% → 0 to 0.25% · 10-year 5.2% → 2.1%",
    body: [
      "From the first cracks in subprime mortgages to a Fed rate of zero took sixteen months. The 10-year fell to 2.1% because a Treasury was the only thing anyone wanted to own. Oil went from $145 to $35, and expected inflation fell with it.",
      "This is the first time on the chart the Fed hit zero and could not cut further.",
    ],
    forces: [
      { pillar: "reaction", note: "The Fed's job said cut below zero. It stopped at zero and needed new tools." },
      { pillar: "premium", note: "Everyone wanted safety, so investors paid up for Treasuries and the extra pay for waiting went negative." },
      { pillar: "fisher", note: "For a few weeks the market expected prices to fall outright." },
    ],
  },
  {
    id: "zero-and-qe",
    n: "05",
    title: "Zero, and then the printing press",
    start: "2009-01-01",
    end: "2012-12-31",
    anchor: "2012-06-01",
    when: "2009 to 2012",
    levels: "Fed funds pinned near 0.1% · 10-year 4.0% (April 2010) → 1.5% (mid-2012)",
    body: [
      "With its rate stuck at zero, the Fed bought bonds instead: three rounds of QE between 2009 and 2012. In 2011 it promised to hold rates at zero \"at least through mid-2013\". The 10-year fell to 1.5% in 2012 while the Fed's rate did not move.",
      "Everything in this stretch works through ideas 02 and 04.",
    ],
    forces: [
      { pillar: "expectations", note: "A dated promise replaced the market's guess about when hikes would start, and pushed it years out." },
      { pillar: "premium", note: "The Fed bought trillions of bonds, so investors needed no extra pay to hold them." },
      { pillar: "neutral", note: "Estimates of the resting rate fell toward zero. \"Secular stagnation\" became the phrase for it." },
    ],
  },
  {
    id: "taper-tantrum",
    n: "06",
    title: "The taper tantrum",
    start: "2013-05-01",
    end: "2013-12-31",
    anchor: "2013-09-06",
    when: "May to December 2013",
    levels: "10-year 1.7% → 3.0% · Fed funds unchanged at 0.1%",
    body: [
      "On May 22 Bernanke said the Fed might slow its bond buying \"in the next few meetings\". The 10-year jumped from 1.7% to 3% in four months. The Fed's rate never moved, and the buying did not actually slow until the next year.",
      "Bond prices move when the Fed announces a change, not when it makes it.",
    ],
    forces: [
      { pillar: "premium", note: "Almost the whole jump was extra pay for waiting. Investors repriced who would own the bonds." },
      { pillar: "expectations", note: "The market also moved the first hike earlier, until the Fed talked it back." },
    ],
  },
  {
    id: "lower-for-longer",
    n: "07",
    title: "Lower for longer",
    start: "2014-01-01",
    end: "2016-11-08",
    anchor: "2016-07-08",
    when: "2014 to late 2016",
    levels: "10-year 3.0% → 1.4% (record low, July 2016) · Fed funds lifted once, to 0.4%",
    body: [
      "The Fed finally raised rates in December 2015, once, and then waited a year. Oil halved, inflation came in under target, German and Japanese 10-year yields went below zero, and after the Brexit vote the US 10-year hit 1.37%, its lowest ever.",
      "The Fed cut its own estimate of where rates settle from 4.25% to 3% over these three years.",
    ],
    forces: [
      { pillar: "neutral", note: "An ageing, saving world: the resting rate looked close to zero." },
      { pillar: "fisher", note: "The oil crash pulled expected inflation down, so much of the fall was the inflation part." },
      { pillar: "premium", note: "With yields below zero abroad, global savers bought Treasuries, so the extra pay for waiting stayed negative." },
    ],
  },
  {
    id: "normalization",
    n: "08",
    title: "Normalization",
    start: "2017-01-01",
    end: "2018-12-31",
    anchor: "2018-10-05",
    when: "2017 to 2018",
    levels: "Fed funds 0.6% → 2.4% · 10-year 2.4% → 3.2%",
    body: [
      "Seven hikes in two years, and from October 2017 the Fed let its bond holdings shrink. A tax cut widened the deficit with unemployment under 4%. In October 2018 Powell said rates were \"a long way from neutral\", and the 10-year hit 3.2%.",
      "Stocks fell 20% in ten weeks. By December the same rate was \"just below\" neutral.",
    ],
    forces: [
      { pillar: "reaction", note: "Low unemployment and rising inflation: textbook hikes." },
      { pillar: "expectations", note: "The Fed's forecasts showed more hikes than the market believed. The 10-year sat in between." },
      { pillar: "neutral", note: "\"Long way from neutral\" was a guess about the resting rate. The market's reaction said the guess was too high." },
    ],
  },
  {
    id: "pivot-inversion",
    n: "09",
    title: "The pivot and the inversion",
    start: "2019-01-01",
    end: "2019-12-31",
    anchor: "2019-08-30",
    when: "2019",
    levels: "10-year 2.7% → 1.5% · Fed funds 2.4% → 1.55% in three cuts",
    body: [
      "In January the Fed stopped hiking. By August the 10-year paid less than the Fed's overnight rate, and the Fed cut three times during a trade war with China. The 10-year bottomed at 1.5% before the second cut.",
      "A 10-year below the Fed's rate means the market expects cuts. It was right.",
    ],
    forces: [
      { pillar: "expectations", note: "The inverted curve was the market averaging a path of cuts." },
      { pillar: "reaction", note: "Tariffs and a slowing world economy: the Fed cut as insurance." },
    ],
  },
  {
    id: "covid",
    n: "10",
    title: "The floor",
    start: "2020-02-20",
    end: "2020-12-31",
    anchor: "2020-07-31",
    when: "2020",
    levels: "Fed funds 1.55% → 0.05% · 10-year 1.8% → 0.5%",
    body: [
      "Two emergency cuts to zero in twelve days in March, then unlimited bond buying. In the week of March 9 the 10-year yield rose, not fell: funds were selling even Treasuries to raise cash. Fed purchases of $120 billion a month stopped that.",
      "By August the 10-year was 0.5%, a record. After inflation, lenders were losing about 1% a year to hold it.",
    ],
    forces: [
      { pillar: "reaction", note: "Zero and QE within days: the 2008 playbook, faster." },
      { pillar: "premium", note: "First a scramble for cash drove the extra pay up. Then Fed buying drove it far below zero." },
      { pillar: "fisher", note: "Expected inflation was 1.7% and the yield was 0.5%, so the real return was negative." },
    ],
  },
  {
    id: "inflation-returns",
    n: "11",
    title: "Inflation returns",
    start: "2021-01-01",
    end: "2022-12-31",
    anchor: "2022-10-21",
    when: "2021 to 2022",
    levels: "10-year 0.9% → 4.2% · Fed funds 0.1% → 4.3% in nine months",
    body: [
      "Prices rose 9.1% in the year to June 2022, the most since 1981, after a year of the Fed calling inflation \"transitory\". Hikes began in March 2022 and included four straight 0.75-point moves, the fastest tightening since the early 1980s. The 10-year went from under 1% to over 4%.",
      "Expected inflation peaked near 3% and then fell. The market believed the Fed would win.",
    ],
    forces: [
      { pillar: "fisher", note: "The inflation part jumped first. Then the real part swung from -1% to +1.5% as the Fed caught up." },
      { pillar: "reaction", note: "Late, then aggressive. The Fed showed it would still fight inflation, and long-run expectations held." },
      { pillar: "expectations", note: "Every hawkish speech moved the 10-year more than the actual hikes did." },
    ],
  },
  {
    id: "higher-for-longer",
    n: "12",
    title: "Higher for longer",
    start: "2023-01-01",
    end: "2023-12-31",
    anchor: "2023-10-20",
    when: "2023",
    levels: "Fed funds 4.3% → 5.3% (last hike July) · 10-year 3.4% → 5.0% → 3.9%",
    body: [
      "The Fed's last hike was in July, yet the 10-year kept climbing, to 5% in October for the first time since 2007. Fitch cut the US credit rating in August, the same week the Treasury announced bigger auctions. The extra pay for waiting turned positive for the first time in two years.",
      "Then in December Powell talked about cuts, and the 10-year fell a full point in seven weeks.",
    ],
    forces: [
      { pillar: "premium", note: "More debt to sell, less certainty about inflation, and the Fed no longer buying." },
      { pillar: "expectations", note: "September's Fed forecast said \"higher for longer\". December's press conference said the opposite. The 10-year followed the words." },
      { pillar: "reaction", note: "Pausing at 5.3%: the Fed shifted from fighting inflation to guarding against a recession." },
    ],
  },
  {
    id: "cuts-long-end-rises",
    n: "13",
    title: "The Fed cuts, and the 10-year rises",
    start: "2024-01-01",
    end: "2024-12-31",
    anchor: "2024-12-27",
    when: "2024",
    levels: "Fed funds 5.3% → 4.3% from September · 10-year 3.7% (September) → 4.6% (December)",
    body: [
      "The Fed cut a full point starting in September, and the 10-year rose a full point. The economy stayed strong, so the market expected fewer cuts than before, and the extra pay for waiting kept climbing with a deficit near 6% of GDP in a full-employment economy.",
      "The two lines crossed. For the first time since 2022 the 10-year paid more than the Fed's rate.",
    ],
    forces: [
      { pillar: "expectations", note: "Each strong jobs report meant fewer cuts ahead. The expected end point rose nearly a point." },
      { pillar: "premium", note: "A lot of new debt, and no Fed buying it." },
      { pillar: "neutral", note: "The market decided the resting rate had risen, so rates would settle higher than the Fed's own forecast." },
    ],
  },
  {
    id: "tariffs-2025",
    n: "14",
    title: "Tariffs, a downgrade, and three more cuts",
    start: "2025-01-01",
    end: "2025-12-31",
    anchor: "2025-04-11",
    when: "2025",
    levels: "10-year 4.0% → 4.5% in one week (April) · Fed funds held at 4.3%, then cut to 3.6% by December",
    body: [
      "Sweeping tariffs on April 2 sent stocks down, and bonds fell too: the 10-year jumped half a point in a week as leveraged funds unwound Treasury trades and foreign buyers hesitated. A 90-day pause followed. Moody's removed the last AAA rating in May.",
      "The Fed held all year under public pressure from the White House, then cut at three straight meetings as hiring slowed. Powell's term as chair had five months left.",
    ],
    forces: [
      { pillar: "premium", note: "Yields rose during a growth scare, when they normally fall. For a week Treasuries traded like a risky asset." },
      { pillar: "reaction", note: "The Fed cut when its job said to, but the market started asking whether the next chair would do the same." },
      { pillar: "expectations", note: "Gradual cuts, priced in early and delivered late." },
    ],
  },
  {
    id: "five-percent-2026",
    n: "15",
    title: "Five percent again",
    start: "2026-01-01",
    end: "2026-10-15",
    anchor: "2026-10-02",
    when: "2026",
    levels: "10-year 3.97% (February 27) → 5.31% (October 5) · Fed funds raised to 3.75 to 4.00% on September 16",
    body: [
      "War with Iran began on February 28. The Strait of Hormuz closed and oil crossed $100. Inflation went from 2.4% to 3.4%. Kevin Warsh became Fed chair on May 22, and in September the Fed raised rates for the first time since 2023. The 10-year closed above 5.3% on October 5, the highest since 2002.",
      "Which part moved? Not inflation: expected inflation barely changed. Almost all of the rise since February was the real return, which reached 2.95% on TIPS, the highest since 2008. Japan's 10-year passed 3% for the first time since 1996 and German yields rose nearly as much as American ones.",
    ],
    forces: [
      { pillar: "fisher", note: "About 94% of the rise since February 27 was real return, not inflation." },
      { pillar: "premium", note: "Models put about half the rise in extra pay for waiting: heavy government borrowing, hedge funds as the main buyers, and $200 billion of AI-company bonds competing for the same money." },
      { pillar: "neutral", note: "The world is investing again. Big tech spent $566 billion on data centres in a year, and estimates of the resting rate are rising." },
      { pillar: "reaction", note: "A new chair raised rates into an oil shock. The Fed still fights inflation, and the market priced one more hike." },
      { pillar: "expectations", note: "Only about a fifth of the move came from expected Fed hikes. The rest is ideas 01, 04 and 05." },
    ],
  },
];

export const EPISODE_BY_ID = Object.fromEntries(EPISODES.map((e) => [e.id, e])) as Record<string, Episode>;
