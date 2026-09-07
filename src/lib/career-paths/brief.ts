// Content module for "Should You Join a Startup?"
// Numbers are drawn from projects/career-paths/research/sources_startup.md.
// Where that file marks a figure as an estimate, the prose says "roughly" and keeps a range.

export interface BriefSection {
  id: string;
  /** The h2. A claim or a verb, not a label. */
  heading: string;
  /** The heading in a few words, for the floating contents control. */
  short: string;
  /** One bold sentence under the heading; the section in one line. */
  takeaway?: string;
  /** For the two table sections the first paragraph leads into the table and the rest follow it. */
  paragraphs: string[];
  /** A boxed worked case, rendered after the paragraphs. */
  callout?: { title: string; body: string };
}

export interface FundingRow {
  model: string;
  owner: string;
  wants: string;
  horizon: string;
  cashPay: string;
  equity: string;
  liquidity: string;
  jobRisk: string;
  goodOutcome: string;
  experience: string;
}

export interface StageRow {
  stage: string;
  roundSize: string;
  postMoney: string;
  headcount: string;
  newGradGrant: string;
  cashVsMarket: string;
  nextStageOdds: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const BRIEF: BriefSection[] = [
  {
    id: "who-funded-it",
    heading: "Who funded the company decides what your job is like",
    short: "Who funded it",
    paragraphs: [
      "A recruiter says, \"We just closed our B,\" and the new grad nods. The recruiter moves on to the free lunch. Nobody says what the B cost the company, who now sits on its board, or what that means for the offer on the table. The letter is not trivia. It says how much money the company has already promised to return to investors before an employee sees anything from a sale.",
      "Two questions decide most of what an employee will experience: who owns the company, and what stage it is at. Ownership tells you what the people in charge want and how fast they want it. Stage tells you how likely the company is to survive, how much of it a new hire can expect, and how much cash it can afford to pay. A seed startup and a Series C startup are different jobs with different odds.",
    ],
  },
  {
    id: "funding-models",
    heading: "Twelve ways a company gets funded",
    short: "Twelve funding models",
    paragraphs: [
      "Read the owner column first and the cash column second; the last row, a public company, is the reference point the other eleven depart from.",
    ],
  },
  {
    id: "the-stage-ladder",
    heading: "The stage ladder",
    short: "The stage ladder",
    paragraphs: [
      "Round size, valuation and headcount are Carta medians, drawn from companies on Carta that were still alive when measured and pulled up in 2025 by AI companies, so read them as an optimistic anchor rather than the average for a company you might join.",
      "Failure odds fall as you climb. Grant size falls faster: hire number one at a seed company gets a median 1.5% in Carta's data, and a new grad at seed roughly 0.1% to 0.3%. Cash rises: startup new-grad base salaries run roughly $100K to $180K by Simplify's 2026 data, against big-tech packages of roughly $180K to $285K. Early, you take a large slice of something likely worthless. Late, a tiny slice of something likely to survive, paid mostly in cash.",
    ],
  },
  {
    id: "who-owns-it",
    heading: "Three clocks, and you work on one of them",
    short: "The owner's clock",
    paragraphs: [
      "A founder who never took outside money wins by staying profitable for decades. A venture fund wins by returning many times its money inside a ten-year fund life, so it needs the company to grow fast or fail fast. A private equity firm wins by buying at one price, tightening operations, and selling higher roughly six years later. None of these is wrong. They are different clocks, and the cash and equity columns above follow from them.",
      "Venture investors expect most of their bets to fail, and the company you join is one of them, so cash is thin and options fill the gap. A family owner has no portfolio; the business is the retirement plan, and layoffs are personal. A private equity firm bought with borrowed money and needs the cash flow to service the debt, so headcount is a lever. Whatever the money asks of the company, the company will ask of you.",
    ],
  },
  {
    id: "equity-mechanics",
    heading: "Why your options may be worth nothing",
    short: "Why options may be worth nothing",
    takeaway: "Most people never exercise: options vest slowly, cost cash to exercise, and expire 90 days after you leave.",
    paragraphs: [
      "A stock option is the right to buy a share at a fixed strike price. It pays only if the share is later worth more. A restricted stock unit (RSU) is a promise to hand you a share once it vests. Carta's reports show options dominating through Series B and RSUs common from Series C or D. The strike is set by a 409A valuation, roughly 20% of the preferred price at Series A and roughly 30% at Series B.",
      "Grants vest over four years with a one-year cliff, then monthly. Nothing vests until your first anniversary, when a quarter arrives at once; the rest comes in 36 monthly slices. Leave in month eleven and you get nothing. Vesting only gives you the right to buy. Exercising means paying the strike for every share, in cash, plus any tax due on the spread. At a growth-stage company that bill can run to tens of thousands of dollars.",
      "When you leave, a clock starts. Carta found that 91% of terminated grants carry a post-termination exercise window of 90 days or less. Inside that window you pay to exercise or forfeit. Most people forfeit: Carta's Q4 2024 data shows only 32.2% of vested, in-the-money grants were exercised, down from 54.2% three years earlier. If the company is acquired, acceleration decides whether unvested shares vest early; double-trigger, the more common form, requires both the sale and your termination without cause.",
    ],
  },
  {
    id: "how-money-reaches-you",
    heading: "How money actually reaches you",
    short: "How money reaches you",
    takeaway: "Private shares turn into cash only at an IPO, an acquisition, or a rare tender, and investors are paid first.",
    paragraphs: [
      "Private shares cannot be sold on a whim. An IPO turns them into public shares, but employees are usually barred from selling for a lockup measured in months. An acquisition converts shares into cash or acquirer stock at the deal price. Between those events, a company may run a tender offer, buying shares from employees at a set price, or approve a secondary sale to a private buyer.",
      "Tenders are rarer than the headlines suggest. Carta ran 396 tender offers in 2025, up 62% from the year before and paying roughly 16,000 employees, but that is about 1% of the companies on its platform, and about a fifth were at Series E or later. The cap on what any holder may sell is typically 10% to 25% of their holdings; only 23% of tenders let sellers part with more than half. Median participation in H1 2025 was 56%.",
      "The headline valuation is not your valuation. Investors buy preferred stock, which carries a liquidation preference: the right to get their money back before common holders, meaning founders and employees, receive anything. Carta's deal-terms data shows about 96% to 97% of rounds use a 1x non-participating preference, so investors take either their money back or their pro-rata share, whichever is larger. The sum of those preferences is the preference stack, and it sits between the sale price and your shares.",
    ],
  },
  {
    id: "what-goes-wrong",
    heading: "What goes wrong, and to whom",
    short: "What goes wrong",
    takeaway: "Down rounds, dilution and shutdowns all hit common stock first, and a new grad holds only common.",
    paragraphs: [
      "A down round is a financing at a lower price per share than the last one. Earlier investors usually hold anti-dilution protection, which hands them extra shares to make up for the drop, and those shares come out of everyone else's ownership. Options granted at the old 409A price may now carry a strike above the share value, which is called being underwater. Some companies reprice them or issue fresh grants; many do not.",
      "Even in good rounds, ownership shrinks. Carta's data on 2,005 US software startups puts median dilution per round at 19.5% at seed, 18% at Series A, 14% at Series B, and 10% at Series C. An employee who held 0.2% after seed holds roughly 0.12% after an A, B and C. Most often, though, the company simply dies: Correlation Ventures found about 65% of venture investments return less than the capital invested, and a dead company's options are worth nothing.",
      "Private equity changes the job even when the company survives. Davis, Haltiwanger and co-authors studied 3,200 buyouts and found net employment down about 1% two years after a deal: down 13% in public-to-private deals, up 13% in private-to-private ones. Earnings per worker fell about 1.7%. Equity sits in a management incentive plan for a few senior executives; a new grad gets none. Carta reports average Series D headcount fell 29% from its 2023 peak, and layoffs there arrive in cohorts.",
    ],
    callout: {
      title: "A $60M stack, a $50M sale, and common gets zero",
      body: "A company has raised $60M across several rounds, all at 1x non-participating, and the investors together hold 60% of the fully diluted shares. It sells for $50M. The stack is $60M, more than the price, so the investors split the $50M and common gets zero, whatever the last valuation said. Sell instead for $150M and investors compare their preference ($60M) to their converted share (60% of $150M, or $90M) and convert, because $90M is more. Every share is then paid alike, and a holder of 0.1% receives $150,000, before taxes and exercise cost.",
    },
  },
  {
    id: "lifestyle-vs-venture",
    heading: "Lifestyle business or venture scale",
    short: "Lifestyle or venture scale",
    takeaway: "A lifestyle business pays in cash and stability rather than equity, and it is more likely to exist in ten years.",
    paragraphs: [
      "Not every company is trying to become enormous. A lifestyle business is built to generate a good living for its owner, without outside investors and without an exit. A venture-scale business must aim for hundreds of millions in value or fail trying. The word startup gets applied to both, and the two owners want opposite things from the same employee. One wants you to stay for a decade. The other wants the company worth ten times more in five years.",
      "A bootstrapped or family owner wants stability, competence, and low turnover, and shares profit in cash more often than equity. The family-firm literature notes that owners \"wish to maintain substantial equity ownership\"; a rough estimate is that only 5% to 10% of non-family employees at such firms receive any equity or phantom equity, while 20% to 30% get cash profit share. Pay tends to sit roughly 10% to 25% below large-company cash for the same title.",
      "Survival is the quiet advantage. The Bureau of Labor Statistics tracks every employer business in the country and finds 77.9% still open after one year, 51.4% after five, and 34.7% after ten. Those closures include sales and retirements, so they overstate failure, and they still compare well with a seed-stage venture company. The upside is a steady paycheck, a share of profits, and a boss who plans to be there next year. Nobody should expect to get rich from equity.",
    ],
  },
  {
    id: "questions-to-ask",
    heading: "Ten questions to ask before you sign",
    short: "Ten questions to ask",
    takeaway: "Every one of these can be pasted into an email, and a refusal to answer is itself an answer.",
    paragraphs: [
      "A company that has its house in order will answer most of them within a day. The point is not to negotiate harder. It is to convert a grant expressed as a share count into ownership, price, and the odds of ever being paid, so the equity line can be compared with the salary you give up to get it.",
    ],
  },
];

export const FUNDING_TABLE: FundingRow[] = [
  {
    model: "Bootstrapped / self-funded",
    owner: "Founder, from savings and revenue",
    wants: "Profit and control, kept as long as they like",
    horizon: "Indefinite",
    cashPay: "What revenue allows; often below large-company rates",
    equity: "Rare; cash profit share more common",
    liquidity: "Only if the owner sells the company",
    jobRisk: "Tied to revenue; no runway cliff",
    goodOutcome: "Durable profitable business, steady raises, maybe profit share",
    experience: "Slow, frugal, personal. The owner is in the room and every dollar is theirs.",
  },
  {
    model: "Friends and family",
    owner: "Founder plus relatives writing small checks",
    wants: "Survive long enough to raise real money or turn a profit",
    horizon: "Open-ended",
    cashPay: "Low; sometimes deferred",
    equity: "Possible but small and informal",
    liquidity: "None until a later round or sale",
    jobRisk: "High; cash is thin",
    goodOutcome: "Company reaches seed funding or profitability",
    experience: "A few people wearing every hat; the founder's relatives are your investors, which shapes every decision.",
  },
  {
    model: "Angel",
    owner: "Founder majority; individuals hold small stakes via SAFEs or notes",
    wants: "A path to a venture round or early acquisition",
    horizon: "Loosely 5 to 10 years",
    cashPay: "Below market",
    equity: "Meaningful options for the first hires",
    liquidity: "None until a priced round or exit",
    jobRisk: "High",
    goodOutcome: "Company raises a seed or Series A",
    experience: "Tiny team, weekly pivots, no process. You will build things and also fix the printer.",
  },
  {
    model: "Venture capital",
    owner: "Founders plus funds holding preferred stock and board seats",
    wants: "Fund-returning growth, many times their money back",
    horizon: "Roughly 7 to 10 years, the life of a fund",
    cashPay: "Below market; the gap narrows by stage",
    equity: "Options early, RSUs at growth stage",
    liquidity: "IPO, acquisition, or an occasional tender",
    jobRisk: "Falls with stage; layoffs common",
    goodOutcome: "IPO or acquisition well above the preference stack",
    experience: "Fast, high pressure, growth over everything; frequent reorganizations, big swings in morale around each round.",
  },
  {
    model: "Corporate venture (CVC)",
    owner: "A large company's investing arm, usually a minority alongside VCs",
    wants: "Strategic insight, an option to acquire, and a return",
    horizon: "Tied to the parent's strategy; can shift quickly",
    cashPay: "Same as venture-backed",
    equity: "Same as venture-backed",
    liquidity: "Often the parent buys the company",
    jobRisk: "Venture risk plus parent strategy changes",
    goodOutcome: "Acquisition by the parent or another buyer",
    experience: "Startup pace with a big-company shadow; roadmap bends toward the parent's needs.",
  },
  {
    model: "Venture debt (as an overlay)",
    owner: "Owners unchanged; a lender holds debt plus warrants",
    wants: "Interest, repayment, and a little warrant upside",
    horizon: "The loan term, a few years",
    cashPay: "Unchanged",
    equity: "Unchanged, slightly diluted by warrants",
    liquidity: "Unchanged",
    jobRisk: "Rises; covenants can force cuts before the next round",
    goodOutcome: "Runway stretched to the next equity round",
    experience: "Invisible day to day, until the covenants bite: sudden hiring freezes or cuts near a deadline.",
  },
  {
    model: "Revenue-based financing",
    owner: "Owners unchanged; lender repaid from a share of monthly revenue",
    wants: "Repayment at a fixed multiple",
    horizon: "Until repaid",
    cashPay: "Unchanged",
    equity: "None taken",
    liquidity: "Unchanged",
    jobRisk: "Moderate; revenue dips squeeze cash",
    goodOutcome: "Financing repaid, ownership intact",
    experience: "Disciplined and revenue-obsessed; less hype, steadier hours, modest upside.",
  },
  {
    model: "Crowdfunding",
    owner: "Founder plus many small investors or pre-order customers",
    wants: "Product delivered; small investors want a return",
    horizon: "Open-ended",
    cashPay: "Low",
    equity: "Rare for employees",
    liquidity: "None; secondary markets are thin",
    jobRisk: "High; usually a single product",
    goodOutcome: "Product ships and follow-on money arrives",
    experience: "Public and scrappy; customers are also shareholders and everyone reads the comments.",
  },
  {
    model: "Private equity buyout",
    owner: "A PE fund owns a majority, often with borrowed money",
    wants: "Sell for more than it paid, on a fixed timeline",
    horizon: "Median hold about 6 years (S&P Global, PitchBook)",
    cashPay: "Market rate; bonus common",
    equity: "Management incentive plan only; a new grad gets none",
    liquidity: "At the sale, for plan participants",
    jobRisk: "Higher early, especially in public-to-private deals",
    goodOutcome: "Sale to another PE firm or a strategic buyer",
    experience: "Metrics, cost targets and reporting; job cuts early, then stability if the numbers hold.",
  },
  {
    model: "Search fund",
    owner: "One or two searchers, backed by investors, buy a small company",
    wants: "Grow it and sell at a higher multiple",
    horizon: "Several years to a sale",
    cashPay: "Market for a small company",
    equity: "Rare below the searcher-CEO",
    liquidity: "At the sale",
    jobRisk: "Moderate; a new owner changes things",
    goodOutcome: "Sale at a higher multiple",
    experience: "A small, old-fashioned business run by an ambitious new owner learning on the job.",
  },
  {
    model: "ESOP / employee-owned",
    owner: "A trust holds shares on behalf of employees",
    wants: "Long-term profitability and retention",
    horizon: "Indefinite",
    cashPay: "Market; ownership comes on top of pay (Rutgers)",
    equity: "Allocated to all employees over time",
    liquidity: "Shares repurchased at departure or retirement",
    jobRisk: "Low relative to peers",
    goodOutcome: "Steady growth and a funded retirement account",
    experience: "Stable, long tenures, a real ownership culture; patient about growth.",
  },
  {
    model: "Public company (anchor)",
    owner: "Public shareholders, index funds, insiders",
    wants: "Earnings growth and a rising share price",
    horizon: "Quarterly reporting; indefinite",
    cashPay: "Market",
    equity: "RSUs at a published price",
    liquidity: "Sell any trading day after vesting",
    jobRisk: "Layoffs happen, usually with severance",
    goodOutcome: "Stock rises; pay is predictable",
    experience: "Process, levels, reviews and predictable pay; slower, safer, easier to plan a life around.",
  },
];

export const STAGE_LADDER: StageRow[] = [
  {
    stage: "Pre-seed",
    roundSize: "roughly $1M on a SAFE ($0.5M to $2M)",
    postMoney: "roughly $8M to $12M cap",
    headcount: "1 to 3",
    newGradGrant: "n/a; rarely hires new grads",
    cashVsMarket: "roughly 30% or more below big-tech total comp",
    nextStageOdds: "n/a",
  },
  {
    stage: "Seed",
    roundSize: "$4M (2025); $4.1M (Q1 2026)",
    postMoney: "$20M (2025); $24.3M (Q1 2026)",
    headcount: "avg 6.2; median about 4",
    newGradGrant: "roughly 0.1% to 0.3% (eng); about half that for non-eng",
    cashVsMarket: "roughly 30% below big-tech total comp",
    nextStageOdds: "about 50% raise an A within 4 years; 25% to 30% within 2",
  },
  {
    stage: "Series A",
    roundSize: "$19.6M",
    postMoney: "$78.7M (about $55M excluding AI)",
    headcount: "avg 16.8",
    newGradGrant: "roughly 0.05% to 0.1% (eng); about half for non-eng",
    cashVsMarket: "roughly 20% below big-tech total comp",
    nextStageOdds: "roughly 60% reach a B",
  },
  {
    stage: "Series B",
    roundSize: "roughly $40M",
    postMoney: "$120M to $160M or more",
    headcount: "avg 48.2",
    newGradGrant: "roughly 0.02% to 0.08% (eng); about half for non-eng",
    cashVsMarket: "roughly 20% below big-tech total comp",
    nextStageOdds: "roughly 60% reach a C",
  },
  {
    stage: "Series C+",
    roundSize: "roughly $60M to $80M (estimate)",
    postMoney: "roughly $300M to $400M (estimate)",
    headcount: "roughly 80 to 100",
    newGradGrant: "RSUs worth roughly $30K to $80K over 4 years",
    cashVsMarket: "roughly 10% below big-tech total comp",
    nextStageOdds: "roughly 60% reach a D; 38% of a Series C cohort exited within 10 years",
  },
  {
    stage: "Growth / late (Series D+)",
    roundSize: "roughly $100M or more",
    postMoney: "roughly $600M to $1B or more (estimate)",
    headcount: "avg 131",
    newGradGrant: "RSUs; roughly 0.002% to 0.01% of the company",
    cashVsMarket: "roughly 10% below big-tech total comp",
    nextStageOdds: "n/a; 62% of a Series C cohort had no exit after 10 years",
  },
  {
    stage: "Pre-IPO",
    roundSize: "n/a",
    postMoney: "n/a",
    headcount: "n/a",
    newGradGrant: "double-trigger RSUs, dollar-denominated",
    cashVsMarket: "near market",
    nextStageOdds: "fewer than 1% of startups ever IPO; median age at IPO 12 years (Ritter)",
  },
  {
    stage: "Public",
    roundSize: "n/a",
    postMoney: "market cap, published daily",
    headcount: "n/a",
    newGradGrant: "RSUs, sellable after vesting",
    cashVsMarket: "market",
    nextStageOdds: "n/a",
  },
];

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Pre-money / post-money",
    definition: "Pre-money is what investors agree the company is worth before their cash goes in. Post-money is pre-money plus the new cash, and it is the number people quote as the valuation.",
  },
  {
    term: "Dilution",
    definition: "The shrinking of your ownership percentage when the company issues new shares to investors or employees. You keep the same number of shares; there are simply more shares in total.",
  },
  {
    term: "Fully diluted",
    definition: "The share count that includes every share that could exist: issued stock, all options (granted or not), warrants, and convertible notes. Your percentage should always be quoted against this number.",
  },
  {
    term: "Option pool",
    definition: "Shares set aside for employee grants. Investors usually require it to be created or refilled before their round, so the pool comes out of founders' and existing employees' ownership.",
  },
  {
    term: "Strike price",
    definition: "The fixed price you pay per share when you exercise an option. Set at the fair market value of common stock on the grant date, which is what the 409A valuation determines.",
  },
  {
    term: "409A valuation",
    definition: "An independent appraisal of what the company's common stock is worth, used to set strike prices. It is usually well below the price investors paid for preferred stock in the last round.",
  },
  {
    term: "ISO",
    definition: "Incentive stock option. Can qualify for long-term capital gains treatment if you hold the shares long enough after exercise, but the spread at exercise can trigger the alternative minimum tax.",
  },
  {
    term: "NSO",
    definition: "Non-qualified stock option. The spread between strike and fair value is taxed as ordinary income when you exercise, with withholding, and later gains are capital gains.",
  },
  {
    term: "RSU",
    definition: "Restricted stock unit. A promise to give you a share once it vests, with no strike price to pay. At private companies RSUs usually also require a liquidity event before they settle.",
  },
  {
    term: "Vesting",
    definition: "The schedule on which your grant becomes yours. The standard at venture-backed companies is four years, with nothing until the first anniversary and monthly portions after that.",
  },
  {
    term: "Cliff",
    definition: "The period, usually one year, during which nothing vests. If you leave before the cliff, you walk away with no equity at all.",
  },
  {
    term: "Acceleration (single and double trigger)",
    definition: "A clause that vests unvested shares early. Single trigger fires on a sale of the company alone. Double trigger requires a sale and then your termination without cause, and is the more common form.",
  },
  {
    term: "Post-termination exercise window",
    definition: "How long after leaving you have to pay for your vested options before they are cancelled. Ninety days is standard; some companies extend it to several years.",
  },
  {
    term: "Early exercise and 83(b)",
    definition: "Some plans let you exercise options before they vest. Filing an 83(b) election with the IRS within 30 days starts the capital gains clock early and can reduce taxes later, but you pay cash for shares you might forfeit.",
  },
  {
    term: "Liquidation preference",
    definition: "The right of preferred stockholders to receive their money back before common holders get anything when the company is sold or wound down. A 1x preference means one times what they invested.",
  },
  {
    term: "Participating vs non-participating",
    definition: "Non-participating preferred takes either its preference or its pro-rata share, whichever is larger. Participating preferred takes the preference and then also shares in what remains. Non-participating is the norm.",
  },
  {
    term: "Preference stack",
    definition: "The total of all liquidation preferences across every round, in order of seniority. In a sale, this amount is paid to investors first, and common stock is paid only from what is left.",
  },
  {
    term: "Down round",
    definition: "A financing at a lower price per share than the previous round. It usually triggers anti-dilution protection for earlier investors and can leave employee options underwater.",
  },
  {
    term: "Anti-dilution",
    definition: "A term that gives earlier investors extra shares if a later round is priced lower, protecting their percentage. The extra shares come out of everyone else's ownership, including employees.",
  },
  {
    term: "Secondary sale",
    definition: "Selling your private shares to another investor rather than back to the company. Most companies must approve the buyer and many restrict or forbid these sales outright.",
  },
  {
    term: "Tender offer",
    definition: "An organized event where the company or an outside investor offers to buy shares from employees at a set price. Usually capped at a fraction of each person's holdings.",
  },
  {
    term: "Lockup",
    definition: "A period after an IPO during which insiders, including employees, may not sell their shares. The stock can move a great deal before the lockup expires.",
  },
  {
    term: "Runway",
    definition: "How many months the company can keep operating at its current spending before the cash runs out. It sets the deadline for the next round, a profit, or a shutdown.",
  },
  {
    term: "QSBS",
    definition: "Qualified small business stock. A federal tax exclusion that can wipe out capital gains tax on shares of qualifying small companies held long enough. The rules changed in 2025, so check current thresholds and holding periods rather than relying on an older summary.",
  },
];

export const QUESTIONS_TO_ASK: string[] = [
  "How many fully diluted shares are outstanding, so I can convert my grant into a percentage of the company?",
  "What was the most recent 409A valuation per share, and what price per share did investors pay in the last preferred round?",
  "What is the total liquidation preference stack today, and are any rounds participating or above 1x?",
  "How long is the post-termination exercise window for my options if I leave?",
  "Does my grant carry any acceleration, and is it single-trigger or double-trigger?",
  "How many months of runway does the company have at its current burn rate?",
  "When did the last round close, and what were its price and headline terms?",
  "How has headcount changed over the past twelve months, and what is the hiring plan for the next twelve?",
  "What is the company's policy on employee secondary sales, and has it run a tender offer?",
  "Does the company plan to refresh the option pool in the next round, and by roughly how much?",
];

export const STARTERS: string[] = [
  "What happens to my options if the company is acquired for less than it raised?",
  "Why does a Series B pay more cash than a seed?",
  "What is a one-year cliff?",
  "How much does it cost me to exercise?",
  "What does private equity ownership mean for my job?",
  "Is a lifestyle business bad for an employee?",
];
