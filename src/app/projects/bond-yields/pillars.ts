/**
 * The five ideas. Each is a short card in the carousel under the chart:
 * a plain title, a few direct sentences, and the question to ask of any
 * move in yields. The timeline's episode cards tag these by id, so the
 * reader meets the same five names on the chart and in the carousel.
 */

export type PillarId = "fisher" | "expectations" | "reaction" | "premium" | "neutral";

export interface Pillar {
  id: PillarId;
  n: string;
  name: string;
  /** The short name used on tags and chips. */
  tag: string;
  color: string;
  body: string[];
  question: string;
}

export const PILLARS: Pillar[] = [
  {
    id: "fisher",
    n: "01",
    name: "A yield is a real return plus inflation",
    tag: "Inflation vs. real",
    color: "#d55e00",
    body: [
      "A 10-year Treasury paying 5% is not paying you 5% in real terms. Part of that 5% is what you earn for lending. The rest just makes up for prices rising. If inflation is expected to run at 2%, your real return is about 3%.",
      "The market quotes both parts. TIPS are Treasuries that pay the real part only, and the gap between a TIPS and a normal Treasury is the market's inflation forecast. When a yield moves, check which part moved.",
    ],
    question: "Did the real return move, or did expected inflation?",
  },
  {
    id: "expectations",
    n: "02",
    name: "A 10-year yield is a bet on where the Fed is going",
    tag: "Fed expectations",
    color: "#0072b2",
    body: [
      "The Fed sets one rate: the overnight rate banks charge each other. Every longer rate is set by the market. The market sets the 10-year by guessing where the Fed's rate will go over the next ten years and averaging that out.",
      "So when the Fed hints at cuts, the 10-year falls before any cut happens. If the 10-year is below the Fed's rate, the market is betting on cuts, which usually means it expects a recession. That is what an inverted yield curve means.",
    ],
    question: "Where does the market think the Fed's rate is going?",
  },
  {
    id: "reaction",
    n: "03",
    name: "The Fed's job is to balance inflation and unemployment",
    tag: "The Fed's job",
    color: "#009e73",
    body: [
      "Congress gave the Fed two goals: keep inflation near 2% and keep people employed. Its main tool is the overnight rate. Inflation too high: raise the rate so borrowing slows. Unemployment rising: cut the rate so borrowing picks up. If the rate is already at zero, the Fed buys bonds (quantitative easing, or QE) and promises to keep rates low.",
      "The bond market knows these habits. Each new inflation or jobs number moves yields by what it means for the Fed's next move.",
    ],
    question: "What will the next inflation or jobs number make the Fed do?",
  },
  {
    id: "premium",
    n: "04",
    name: "Lenders charge extra to lock money up for ten years",
    tag: "Term premium",
    color: "#7a5195",
    body: [
      "Lending for ten years is riskier than lending overnight again and again. Inflation could jump. The Fed could change course. Investors want extra yield for that risk, and the extra is called the term premium.",
      "It rises when the government is selling a lot of debt, when inflation is unpredictable, or when the big buyers (the Fed, foreign central banks) step back. It falls, even below zero, when investors are scared and want safe bonds at any price, or when the Fed is buying.",
    ],
    question: "Who is buying 10-year bonds, and how much extra are they asking?",
  },
  {
    id: "neutral",
    n: "05",
    name: "Every economy has a resting rate",
    tag: "Resting rate (r*)",
    color: "#b8860b",
    body: [
      "Strip out the ups and downs and there is a rate at which the economy neither speeds up nor slows down. Economists call it r-star. Nobody can see it, only estimate it. More saving (ageing populations) pushes it down. More borrowing and investing (data centres, big deficits) pushes it up.",
      "It matters because it is where the Fed's rate ends up once a cycle is over, and the 10-year is an average over the whole cycle. The New York Fed's estimate fell from about 3% in 2000 to under 1% in the 2010s. It is now being revised up.",
    ],
    question: "Where does the Fed's rate settle when this cycle is over?",
  },
];

export const PILLAR_BY_ID = Object.fromEntries(PILLARS.map((p) => [p.id, p])) as Record<PillarId, Pillar>;
