// Content module for "Should You Join a Startup?"
// Numbers are drawn from projects/career-paths/research/sources_startup.md.
// Where that file marks a figure as an estimate, the prose says "roughly" and keeps a range.

export interface BriefSection {
  id: string;
  heading: string;
  paragraphs: string[];
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
    id: "what-the-letters-mean",
    heading: "What the letters mean",
    paragraphs: [
      "A new grad sits across from a recruiter who says, \"We just closed our B.\" The grad nods. The recruiter moves on to the free lunch. Nobody explains what a B is, what it cost the company, or what it means for the offer on the table. This page fills that gap. The letters are shorthand for how far a company has climbed a funding ladder that runs from a founder's savings through seed, Series A, B, C, and onward to a public listing. Each rung is a new group of investors buying a slice of the company at a new price.",
      "Two questions decide most of what an employee will experience: who owns the company, and what stage it is at. Ownership tells you what the people in charge want and how fast they want it. Stage tells you how likely the company is to survive, how much of it a new hire can expect to be given, and how much cash the company can afford to pay. A seed startup and a Series C startup both call themselves startups. They are different jobs with different odds, and the offer letter rarely says which one you are looking at.",
      "Each round has a rough size and a rough valuation attached. Carta's 2025 data puts the median seed round at $4M with a $20M post-money valuation; by Q1 2026 those figures were $4.1M and $24.3M. A Series A in Carta's Q1 2026 data is a median $19.6M raise at a $78.7M post-money. A Series B is roughly $40M at a valuation of $120M to $160M or more. The letters are therefore a proxy for size, age, and how much money the company has already promised to pay back to investors before employees see anything from a sale.",
    ],
  },
  {
    id: "who-owns-it",
    heading: "Who owns it decides what they want from you",
    paragraphs: [
      "The owner of a company decides what winning looks like, and every employee's pay follows from that definition. A founder who has never taken outside money wins by keeping the business profitable for decades. A venture fund wins by returning many times its money inside a ten-year fund life, which means it needs the company to grow fast or fail fast. A private equity firm wins by buying at one price, tightening operations, and selling at a higher price roughly six years later. None of these is wrong. They are different clocks, and you will be working on one of them.",
      "Those clocks show up in the offer letter. A venture-backed company pays below-market cash and fills the gap with options, because the investors want cash spent on growth rather than salaries. A bootstrapped company pays what it can afford from revenue and rarely shares equity at all. A private equity owner pays market cash, may add a bonus, and keeps equity for a small group of senior executives. The same title at the same size of company can come with three different pay structures, depending only on who sits at the top of the cap table.",
      "Job security follows the same logic. Venture investors accept that most of their bets fail, so the company you join is one of those bets. A family owner has no portfolio; the business is the retirement plan, and layoffs are personal. A private equity firm bought the company with borrowed money and needs the cash flow to service that debt, so headcount is a lever it will pull when the numbers slip. Before reading the salary line, find out who owns the company and what they need from it. Everything else in this explainer follows from that answer.",
    ],
  },
  {
    id: "funding-models",
    heading: "Twelve ways a company gets funded",
    paragraphs: [
      "The table below lines up twelve ways a company can be funded, from a founder's own savings to a public stock listing. For each, it names who owns the company, what that owner is trying to get out of it, how long they plan to hold, and what the arrangement usually means for an employee's cash, equity, chance of selling that equity, and risk of losing the job. The last row, a public company, is there as the reference point most readers already understand, so the other rows can be read as departures from it.",
      "Several of these models stack. A venture-backed company often adds venture debt on top of its equity rounds. A bootstrapped company might take a revenue-based loan to fund inventory. A private equity buyout may keep a founder on as a minority holder. The point of the table is not to sort every company into a single box but to show what each source of money asks of the company, because whatever the money asks of the company, the company will eventually ask of its employees. Read the owner column first and the cash column second.",
    ],
  },
  {
    id: "the-stage-ladder",
    heading: "The stage ladder",
    paragraphs: [
      "The ladder below runs from pre-seed to public. Round size, valuation, and headcount come from Carta's reports. The new-grad grant and cash discount are rough ranges built from Carta's grant data and practitioner benchmarks, and the odds of reaching the next stage combine Carta's graduation rates with secondary estimates. Every Carta figure is drawn from companies that use Carta and were still alive when measured, and 2025 medians are pulled up by AI companies, so treat them as an optimistic anchor rather than the average for any startup you might actually join.",
      "Three things move in opposite directions as you climb. Failure odds fall: Carta reports that only about half of seed companies raise a Series A within four years, while roughly 60% of Series A companies reach a B and a similar share of B companies reach a C. Grant size falls faster. Hire number one at a seed company gets a median 1.5% of the company in Carta's data. A new grad at seed might get roughly 0.1% to 0.3%, and a new grad at Series C typically gets RSUs worth roughly $30K to $80K over four years, a few thousandths of a percent.",
      "Cash pay rises. Startup new-grad base salaries run roughly $100K to $180K by Simplify's 2026 data, against big-tech new-grad packages of roughly $180K to $285K, and the gap narrows as the company matures. This is the trade the ladder offers. Early, you take a large slice of something that will probably be worth nothing. Late, you take a tiny slice of something that will probably survive, paid mostly in cash. Neither is a bad deal. They are different deals, and the letter after the word Series tells you which one you are being offered.",
    ],
  },
  {
    id: "equity-mechanics",
    heading: "How the equity actually works",
    paragraphs: [
      "Startup equity comes in two forms. A stock option is the right to buy a share at a fixed price, called the strike price, at some point in the future. It is worth something only if the share is later worth more than the strike. A restricted stock unit (RSU) is a promise to hand you a share outright once conditions are met, so it has value as long as the share does. Carta's compensation reports show options dominating through Series B, with RSUs becoming common from Series C or D and standard at companies preparing for an IPO.",
      "Options come in two tax flavors. Incentive stock options (ISOs) can be taxed at long-term capital gains rates if you hold the shares long enough, but the gap between strike and fair value at exercise can trigger the alternative minimum tax. Non-qualified stock options (NSOs) are taxed as ordinary income on that gap at exercise, with no AMT surprise. The strike is set by a 409A valuation, an appraisal of the common stock the company commissions. Practitioner rules of thumb put the 409A at roughly 20% of the preferred price at Series A and roughly 30% at Series B, rising toward the preferred price before an IPO.",
      "Grants vest over time. The standard schedule at every venture stage is four years with a one-year cliff, then monthly. Nothing vests until your first anniversary, when a quarter vests at once; the rest arrives in 36 monthly slices. Leave in month eleven and you get nothing. Vesting only gives you the right to buy. Exercising means paying the strike price for every share, in real cash, plus any tax due on the spread. At a growth-stage company where the strike is a large fraction of the preferred price, that bill can run to tens of thousands of dollars.",
      "When you leave, a clock starts. Carta found that 91% of terminated grants carry a post-termination exercise window of 90 days or less. Inside that window you either pay to exercise or forfeit the options. Most people forfeit: Carta's Q4 2024 data shows only 32.2% of vested, in-the-money grants were exercised, down from 54.2% three years earlier. If the company is acquired, acceleration decides whether unvested shares vest early. Single-trigger acceleration vests on the sale alone. Double-trigger, the more common form, requires both the sale and your termination without cause afterward.",
    ],
  },
  {
    id: "how-money-reaches-you",
    heading: "How money reaches you",
    paragraphs: [
      "Private shares cannot be sold on a whim, so money reaches employees through a few narrow doors. An IPO turns private shares into public ones, but employees are usually barred from selling for a lockup period measured in months, during which the price can move a great deal. An acquisition converts shares into cash or acquirer stock at a price set by the deal. Between those two events, a company may run a tender offer, in which the company or an outside buyer purchases shares from employees at a set price, or permit a secondary sale to a private buyer it approves.",
      "Tenders are rarer than the headlines suggest. Carta ran 396 tender offers in 2025, up 62% from the year before and paying roughly 16,000 employees, but that is about 1% of the companies on its platform, and about a fifth of those tenders were at Series E or later. Even when a tender happens, the cap on what any holder may sell is typically 10% to 25% of their holdings; Carta reports only 23% of tenders let sellers part with more than half. Median participation in H1 2025 was 56%, lower at seed through B (46.4%) than at Series C and later (65.6%).",
      "The headline valuation is not your valuation. Investors buy preferred stock, which carries a liquidation preference: the right to get their money back before common holders, meaning founders and employees, receive anything. Carta's deal-terms data shows about 96% to 97% of rounds use a 1x non-participating preference, meaning investors take either their money back or their pro-rata share of the proceeds, whichever is larger, but not both. The sum of those preferences across all rounds is the preference stack, and it sits between the sale price and your shares.",
      "A worked example. A company has raised $60M across several rounds, all at 1x non-participating, and the investors together hold 60% of the fully diluted shares. It sells for $50M. The stack is $60M, more than the price, so the investors split the $50M and common gets zero, whatever the last valuation said. Now suppose it sells for $150M. Investors compare their preference ($60M) to their converted share (60% of $150M, or $90M) and convert, because $90M is more. Every share is then paid alike. A holder of 0.1% receives $150,000, before taxes and before any exercise cost.",
    ],
  },
  {
    id: "what-goes-wrong",
    heading: "What goes wrong",
    paragraphs: [
      "A down round is a financing at a lower price per share than the previous one. Two things happen to employees. First, earlier investors usually hold anti-dilution protection, which hands them extra shares to make up for the price drop, and those shares come out of everyone else's ownership. Second, options granted at the old 409A price may now carry a strike above the current share value, which is called being underwater. Underwater options are worth nothing until the price recovers. Some companies reprice them or issue fresh grants; many do not, and the old grant simply sits there.",
      "Even in good rounds, ownership shrinks. Carta's data on 2,005 US software startups puts median dilution per round at 19.5% at seed, 18% at Series A, 14% at Series B, and 10% at Series C, and each round usually adds a few points of option-pool top-up on top of that. An employee who held 0.2% after a seed round and watched the company raise an A, a B, and a C would hold roughly 0.12% by the end, without ever selling a share. The company is bigger, so the smaller slice may be worth more, but it is not the number in the offer letter.",
      "Most often, the company simply dies. Carta's cohort data shows 30.6% of the seed companies from early 2018 raised a Series A within two years; for the 2022 cohort the figure was 15.4%. By year four about half of seed companies have raised an A, and the remainder mostly shut down, sell for very little, or limp along. Correlation Ventures found that about 65% of venture investments return less than the capital invested. When a company closes, options are worthless, and there is no severance for equity. The salary you gave up to get the grant is gone with it.",
      "Private equity ownership changes the job even when the company survives. Davis, Haltiwanger, and co-authors studied 3,200 buyouts and found net employment down about 1% two years after a deal, with wide variation: down 13% in public-to-private deals and up 13% in private-to-private ones. Earnings per worker fell about 1.7%. Equity at PE-backed companies sits in a management incentive plan for a small group of senior executives; a new grad gets none. Growth-stage venture companies have their own version. Carta reports average Series D headcount fell 29% from its 2023 peak, and layoffs there arrive in cohorts, often right after a hiring class.",
    ],
  },
  {
    id: "lifestyle-vs-venture",
    heading: "Lifestyle business or venture scale",
    paragraphs: [
      "Not every company is trying to become enormous. A lifestyle business is built to generate a good living for its owner, indefinitely, without outside investors and without an exit. A venture-scale business is built to grow to a size that returns a fund, which means it must aim for hundreds of millions in value or fail trying. The word startup gets applied to both, and the confusion is expensive, because the two owners want nearly opposite things from the same employee. One wants you to stay for a decade. The other wants the company to be worth ten times more in five years.",
      "A bootstrapped or family owner wants stability, competence, and low turnover. Profit shared in cash is more common than equity. The family-firm literature notes that owners \"wish to maintain substantial equity ownership,\" and a rough estimate is that only 5% to 10% of non-family employees at such firms receive any equity or phantom equity, while 20% to 30% get cash profit share. Pay tends to sit roughly 10% to 25% below large-company cash for the same title. In exchange, the business is not on a fund's clock, does not need to be sold, and does not need to grow to justify your seat.",
      "Survival is the quiet advantage. The Bureau of Labor Statistics tracks every employer business in the country and finds 77.9% still open after one year, 51.4% after five, and 34.7% after ten. Those closures include sales and retirements, so they overstate failure, and they still compare well with a seed-stage venture company. A lifestyle business is not a bad place for an employee. It is a place where the upside is a steady paycheck, a share of profits, and a boss who plans to be there next year, and where nobody should expect to get rich from equity.",
    ],
  },
  {
    id: "questions-to-ask",
    heading: "Questions to ask before you sign",
    paragraphs: [
      "The questions below are the ones an offer letter will not answer on its own. Every one of them can be pasted into an email to a recruiter or hiring manager, and a company that has its house in order will answer most of them within a day. Refusal to answer is itself an answer. The point is not to negotiate harder. It is to convert a grant expressed as a share count into a grant expressed in ownership, price, and the odds of ever being paid, so that the equity line can be compared with the salary you would give up to get it.",
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
