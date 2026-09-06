# Sourced inputs: non-founder employee outcomes by startup stage

Research date: 2026-09-06. Purpose: parameterize a Monte Carlo of what happens to a new-grad, non-founder employee who joins a US company at one of five stages: seed, Series A-B, growth (Series C+), bootstrapped/family-funded, PE-backed.

Tags: **M** = measured by the source on its own data; **E** = estimated (by the source, or by me with reasoning marked ESTIMATE).

**Standing bias note on Carta.** Every Carta figure below is drawn from companies that (a) use Carta for cap-table management, which skews to venture-backed, US, software, and better-organized companies, and (b) in most reports, are still on the platform when measured. Dead companies churn off; that is survivor-conditioning. Round-size and valuation medians are also pulled up in 2025-26 by AI companies (Carta: >60% of Q1 2026 capital raised on the platform went to AI). Treat Carta medians as an optimistic anchor for a random startup joiner, not a population mean. This note is abbreviated to "Carta survivor bias" in the tables.

Several Carta pages return HTTP 403 to non-browser fetchers; where a Carta figure was read through a secondary summary (SaaStr, Chronograph, Mucker, search-index snippets) that is noted in the source column.

---

## A. Stage ladder facts

### A1. Round size, post-money valuation, headcount

| stage | round size (median) | post-money (median) | headcount | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|---|
| Pre-seed | ~$1M (SAFE; 25th-75th roughly $0.5-2M) | ~$8-12M cap | 1-3 | ESTIMATE from Carta seed data and valueaddvc summary | https://valueaddvc.com/blog/startup-funding-rounds-in-2025-whats-normal-at-pre-seed-seed-a-and-b | 2026 | E | Carta survivor bias; SAFEs are not priced so "valuation" is a cap |
| Seed | $4.1M (Q1 2026); $4M (2025) | $24.3M (Q1 2026); $20M (2025) | avg 6.2 (2025), down from 10.3 (2021); "median just four" | Carta State of Private Markets Q1 2026; Carta State of Seed (via SaaStr) | https://carta.com/data/state-of-private-markets-q1-2026/ ; https://www.saastr.com/the-state-of-seed-today-10-key-learnings-from-cartas-latest-data/ | 2026 | M | Carta survivor bias; AI-inflated |
| Series A | $19.6M | $78.7M (all); ~$55M non-AI | avg 16.8 (2025), down from 25.9 (2021) | Carta SoPM Q1 2026; Carta State of Seed | same as above | 2026 | M | Carta survivor bias; AI skew is large at A |
| Series B | ~$40M | $120-160M+ | avg 48.2 (2025), down from 72.3 (2022) | Carta via valueaddvc/Carta State of Seed | https://valueaddvc.com/blog/startup-funding-rounds-in-2025-whats-normal-at-pre-seed-seed-a-and-b | 2026 | M | Carta survivor bias |
| Series C | ~$60-80M | ~$300-400M | ~80-100 | ESTIMATE: Carta SoPM Q4 2025 page was 403; interpolated between B and D | https://carta.com/data/state-of-private-markets-q4-2025/ | 2025 | E | Carta survivor bias |
| Series D+ | ~$100M+ | ~$600M-1B+ | avg 131 at Series D (2025), down 29% from 2023 peak | Carta State of Startup Compensation H2 2025 (headcount); valuation ESTIMATE | https://carta.com/data/startup-compensation-h2-2025/ | 2025 | M (headcount) / E (valuation) | Carta survivor bias |

### A2. Time between rounds

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Seed to Series A, median | 2.1 (up from 1.5 in 2019); 75th pct 3.4 | years | Carta State of Seed via SaaStr | https://www.saastr.com/the-state-of-seed-today-10-key-learnings-from-cartas-latest-data/ | 2025 | M | conditioned on companies that DID raise an A: survivor bias squared |
| Seed to A, Q3 2025 cohort | 15% in <=12 mo; 23% in 1.5-2 yr; 39% took 3+ yr (vs 19% for Q3 2019 cohort) | share | Carta, 3,365 US Series A raisers 2018-2025, via SaaStr | https://www.saastr.com/your-seed-round-now-needs-to-last-3-years-what-3365-startups-tell-us-about-the-new-series-a-timeline | 2025 | M | same |
| Series A to B, B to C | ESTIMATE ~2.0 each (Carta has reported "longer from A to B"; pre-2022 norm was ~1.5-2) | years | ESTIMATE | https://carta.com/data/ | 2025 | E | |
| Median time to first hire after seed | 284 days (2024), up from 214 (2019) | days | Carta via SaaStr | as above | 2025 | M | |

### A3. Graduation rates (share reaching next round)

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Seed -> A within 2 yr, 2018 Q1 cohort | 30.6% | Carta newsletter | https://carta.com/data/newsletter-graduation-rate-from-seed-to-series-a/ | 2025 | M | Carta survivor bias; denominator is seed rounds on Carta |
| Seed -> A within 2 yr, 2022 cohort | 15.4% | Carta via Chronograph | https://www.chronograph.pe/current-trends-in-the-series-a-and-seed-venture-markets/ | 2025 | M | same |
| Seed -> A within 2 yr, "normal year" | 25-30% | Carta (Peter Walker) | https://www.pmf.show/q2-early-stage-venture-report-w-cartas-head-of-insights-valuations-round-sizes-graduation-rates/ | 2025 | M | same |
| Seed -> A by year 4 (Q16), 2019 Q1 cohort | 49.1% ("~50%") | Carta State of Seed via SaaStr | https://www.saastr.com/the-state-of-seed-today-10-key-learnings-from-cartas-latest-data/ | 2025 | M | same |
| A -> B, B -> C, C -> D | ~60% each | The Generalist, cited by Chronograph | https://www.chronograph.pe/current-trends-in-the-series-a-and-seed-venture-markets/ | 2024 | E | secondary; no horizon stated |
| Historical seed -> A (all sources) | 20-30%; top funds 50-75% | Alleywatch via Chronograph | same | 2024 | E | |

### A4. Shutdowns

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Shutdown mix by stage, 2025 | Series A rose from ~6% to ~14% of all shutdowns (2.5x); pre-seed/seed share fell; closers are "older, have raised more capital" | SimpleClosure State of Startup Shutdowns 2025 (Carta backed SimpleClosure and handed it its shutdown business) | https://simpleclosure.com/blog/insights/state-of-startup-shutdowns-2025/ | 2025 | M | SimpleClosure sees companies that formally wind down; zombies and quiet acquihires excluded |
| Seed-stage closures Q1 2024 | +102% YoY (vs +58% all stages) | Carta via Chronograph | https://carta.com/data/startup-shutdowns-q1-2024/ | 2024 | M | Carta survivor bias (only counts companies that told Carta they closed) |
| Share of VC investments returning < capital invested | ~65% | Correlation Ventures (thousands of US financings) | https://www.thevccorner.com/p/venture-capital-fund-math-explained | 2014 est., widely re-cited | M | old dataset; investment-level not company-level |
| Series C cohort 2010-2015 with no exit after 10 yr | 62% (677 of 1,102) | PitchBook via Collective Liquidity | https://www.collectiveliquidity.com/articles/bets-on-pre-ipo-companies-are-binary-heres-what-smart-investors-do-instead | 2025 | M | "no exit" mixes dead and still-private |
| BLS establishment survival (all employer businesses) | 77.9% at 1 yr, 51.4% at 5 yr, 34.7% at 10 yr | BLS Business Employment Dynamics through Mar 2025 | https://www.bls.gov/spotlight/2024/business-employment-dynamics-twentieth-anniversary/home.htm | 2025 | M | closure != failure (sales, retirements count); nonemployers excluded |

ESTIMATE, cumulative "company dead or equity worthless" by start stage (my synthesis of A3, A4): seed 5-yr ~55-60%; Series A-B 5-yr ~35-40%; Series C+ 10-yr ~40% (of the 62% no-exit, perhaps two-thirds are dead or written down). Reasoning: if ~50% of seed companies raise an A in 4 years and ~60% of A's raise a B, then ~30% of seed companies reach B; the remainder mostly die, a minority are small acquihires or sustain on revenue.

---

## B. Exit outcomes

### B1. Acquisition value distribution

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Share of M&A transactions under $50M | 92% by count; 12% of value | blog.mean.ceo summary citing PitchBook-style exit data | https://blog.mean.ceo/startup-ma-exits-acqui-hires-valuations-statistics/ | 2026 | M (secondary) | many small deals are undisclosed and imputed |
| Share of exits >= $500M | 3.6% by count; 78.9% of value | PitchBook-NVCA Venture Monitor (via search snippet) | https://nvca.org/wp-content/uploads/2025/10/Q3-2025-PitchBook-NVCA-Venture-Monitor.pdf | 2025 | M | disclosed-value exits only, which skews up |
| Average acquired startup: raised $29.4M, sold for $155.5M | mean, not median | Crunchbase (2020 analysis) | https://news.crunchbase.com/ | 2020 | M | means dominated by outliers; disclosed deals only |
| Older Crunchbase mean: raised $41M, exited at $242.9M | mean | Crunchbase via TechCrunch | https://techcrunch.com/2013/12/14/crunchbase-reveals-the-average-successful-startup-raises-41m-exits-at-242-9m | 2013 | M | same |
| Billion-dollar exits Q2 2026 | 24 acquisitions >= $1B, $113B total, record quarter | Crunchbase | https://news.crunchbase.com/public/data-billion-dollar-startup-exits-ma-ipo-spcx-q2-2026/ | 2026 | M | top of cycle |
| ESTIMATE median disclosed VC-backed acquisition | ~$25-40M; lognormal sigma ~1.7 fits "92% < $50M" with "3.6% > $500M" only if median is ~$15-20M, so undisclosed small deals pull the true median under $25M | | | | E | |

### B2. Share that ever exit; IPO vs M&A; time to exit

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Share of ~7,100 portfolio companies with a recorded exit | 11.4% | Dealum analysis of 12,000 funding rounds | https://blog.dealum.com/mid-market-startup-acquisition/ | 2025 | M | mixed-age cohort; many still alive |
| Share of startups that IPO | <1% | multiple (SVB, Qubit) | https://www.svb.com/startup-insights/startup-strategy/types-startup-exit-strategy/ | 2025 | E | |
| US VC-backed exits 2025 | 995 acquisitions vs 62 IPOs (~94% M&A by count) | PitchBook-NVCA Venture Monitor Q4 2025 (via search snippet) | https://nvca.org/wp-content/uploads/2026/01/q4-2025-pitchbook-nvca-venture-monitor.pdf | 2025 | M | excludes buyouts and undisclosed deals |
| M&A share of VC exits, general | 80-90% | Qubit Capital summary | https://qubit.capital/blog/ipo-vs-acquisition-exit-strategy | 2026 | E | |
| Median founding-to-IPO age, VC-backed, 2010-2019 | 9.2 years; 7.5 after 2020 | PitchBook via Joelson Law | https://joelsonlaw.com/news/are-venture-backed-exits-happening-faster-than-ever/ | 2025 | M | IPO-only |
| Median age at IPO, all US IPOs, 2025 | 12 years (90 IPOs; 74% VC-backed); tech IPOs median 11.8 | Jay Ritter, "IPOs: Age of Companies Going Public" | https://site.warrington.ufl.edu/ritter/files/IPOs-Age-of-Companies-Going-Public.pdf | 2025 | M | age counts from founding |
| Median startup exit timing vs median exit dollar | "median exit takes ~4 years; median exit dollar ~9 years" | Angel Blog summary of Basil Peters | https://www.angelblog.net/venture_capital_exit_times/ | undated | E | old, anecdotal |
| Series C cohort exit within a decade | 38% | PitchBook via Collective Liquidity | https://www.collectiveliquidity.com/articles/bets-on-pre-ipo-companies-are-binary-heres-what-smart-investors-do-instead | 2025 | M | |

### B3. Exits below capital raised (common gets ~nothing)

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| VC-backed exits for less than raised, 2010 onward | 214 companies; >= 13 per year among those that raised >= $50M | CB Insights | https://www.cbinsights.com/research/?p=2346 | ~2016 | M | disclosed deals only; the true count is much higher because small down-exits are undisclosed |
| Investment-level: returned < 1x | ~65%; >10x only 5-7% | Correlation Ventures | https://www.thevccorner.com/p/venture-capital-fund-math-explained | 2014 | M | investment-level |
| Horsley Bridge: 6% of investments produce ~60% of returns | concentration | Mallaby, The Power Law | https://www.masterworks.com/academy/posts/what-is-venture-capital-and-how-do-vc-returns-work | 2022 | M | top-quartile funds |
| ESTIMATE share of acquisitions where common receives < 10% of headline | ~50-60% at seed/A (acquihires and pref-eaten sales), ~35% at B-C, ~20% at growth | reasoning: 92% of deals < $50M while A-round pref stacks are already ~$25M; Carta 1x non-participating is standard so common only gets residual above stack | | | E | |

No Carta report quantifying "how much employees actually get" per exit was reachable; Carta's liquidation-preference content is descriptive (https://carta.com/learn/equity/liquidity-events/acquisition/).

---

## C. Employee equity

### C1. Grant size (% fully diluted) by hire order and role

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Hire #1 median | 1.50% (1.54% for first engineer; quartiles 0.61%-4.13%) | Carta, >9,000 initial grants to first 10 hires, 2024 | https://carta.com/data/linkedin-first-employee-equity-how-much/ ; https://carta.com/data/linkedin-founding-engineer-equity-1-54-percent/ | 2025 | M | Carta survivor bias; seed-stage only |
| Hires #2-#5 median | 0.85%, 0.50%, 0.44%, 0.33% | Carta via SaaStr / Mucker | https://www.saastr.com/how-much-equity-to-give-your-first-employees-the-real-data-from-50000-startups ; https://mucker.com/blog/compensation-benchmarks-early-stage-startups-from-carta/ | 2025 | M | same |
| Hire #6+ | "grants center around 0.3%" by hire 6; hires 8-10 ESTIMATE 0.1-0.2% | Carta community post "Equity for your first 8 hires" | https://community.carta.com/c/corporations-updates/equity-for-your-first-8-hires | 2025 | M / E | same |
| Role ranges, first hires | first sales 1.0-2.0%; first product/design 0.8-1.5%; "engineering at the higher end, business hires middle/lower" | Carta learn page | https://carta.com/learn/startups/compensation/employee-equity/ | 2025 | E | |
| Equity grants vs pre-2022 | ~26% below pre-2022 levels | Carta comp H1 2025 via DataDrivenVC | https://www.newsletter.datadrivenvc.io/p/startup-salaries-equity-and-their-impact-on-employee-retention | 2025 | M | |
| Employee pool size by stage (median % FD) | 12.1% at seed; 16.8% at Series C (exceeds founder 16.1%) | Carta Founder Ownership Report 2025/2026 | https://carta.com/data/founder-ownership/ ; https://carta.com/data/founder-ownership-2026/ | 2026 | M | Carta survivor bias |
| Index Ventures ESOP targets | 12% at A, 14% at B, 16% at C (European benchmark; US higher) | Index Ventures Rewarding Talent | https://www.indexventures.com/rewarding-talent/allocation-considerations-and-benchmarks | 2024 | E | European |

ESTIMATE for a **new-grad, non-founder hire** (not hire #1-5; a new grad is rarely among the first five). Reasoning: at seed a new grad is hire ~6-15, so 0.10-0.30% eng and half that non-eng. At Series A-B (headcount 17-48) a junior grant is typically 0.02-0.08% eng (Index OptionPlan puts a junior engineer at Series A around 0.05-0.1% in the US mode) and 0.01-0.04% non-eng. At Series C+ (headcount 100-500) new-grad grants are typically dollar-denominated RSUs worth $30-80K over 4 years, i.e. 0.002-0.01% of a $500M-1B company.

### C2. RSU vs options by stage; strike as fraction of preferred

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Instrument by stage | options dominate through Series B; RSUs (double-trigger) become common from Series C/D and standard pre-IPO; Carta has reported RSU share of new grants rising past ~50% at Series D+ | Carta comp reports (qualitative); page 403 | https://carta.com/data/startup-compensation-h2-2025/ | 2025 | E | |
| 409A common as % of preferred | ~20% at Series A, ~30% at Series B, rising with stage; general range 25-35% discount to 40-70% of preferred | Scalar.io; a16z "16 things about 409A" | https://scalar.io/insights/409a-common-value-as-a-percentage-of-preferred/ ; https://a16z.com/16-things-to-know-about-the-409a-valuation/ | 2024-25 | E (practitioner rules of thumb) | 409A appraisers are hired by the company; results cluster |
| Seed 409A | rarely legitimately 10-20% of preferred even at seed (a16z) | a16z | same | 2015, still cited | E | |

### C3. Dilution per priced round; option pool refresh

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Median dilution per round (2,005 US software startups) | Seed 19.5%, A 18%, B 14%, C 10% | Carta via startupa.ge summary | https://startupa.ge/blog/startup-equity-dilution-guide | 2025 | M | Carta survivor bias |
| Typical ranges | seed 18-25%, A 17-22%, B 15-18%, C 12-15%, D+ 8-12% | qubit.capital / CRV summaries | https://qubit.capital/blog/venture-capital-stages ; https://www.crv.com/content/equity-dilution | 2025 | E | |
| Option pool by stage | pre-seed/seed 10-15%; Series A top-up to 15-20%; later refreshes 10-15% | Startups.com lexicon; Carta option pool guide | https://www.startups.com/lexicon/option-pool ; https://carta.com/learn/startups/equity-management/option-pool/ | 2025 | E | |
| Founder ownership by stage (median team) | 56.2% post-seed, 36.1% post-A, 23.0% post-B, 16.1% post-C, 11.4% post-D | Carta Founder Ownership Report 2026 | https://carta.com/data/founder-ownership-2026/ | 2026 | M | Carta survivor bias |

Implied per-round dilution for an existing employee = round dilution + pool refresh share; ~20% seed/A, ~17% B, ~13% C, ~11% D.

### C4. Exercise on departure; PTEP windows

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Vested, in-the-money grants exercised, Q4 2024 | 32.2% (down from 54.2% three years earlier) | Carta | https://carta.com/data/linkedin-employee-equity-exercise-rate-two-thirds-dont/ | 2025 | M | Carta survivor bias; measured on grants at companies still on Carta (so "in the money" is per the latest 409A, itself optimistic) |
| Options exercised during PTEP (non-early-exercise grants) | 28% | Carta | https://carta.com/blog/why-employees-dont-exercise-stock-optionsand-what-companies-can-do-to-help/ | 2023 | M | same |
| Exercise rate by terminated employees, early 2025 | dropped below 30% starting March 2025 after >30% for a year | Carta via Doug Levin | https://douglevin.substack.com/p/decline-in-exercising-vested-startup | 2025 | M | same |
| PTEP length | 91.4% of terminated grants have PTE windows <= 90 days | Carta | https://carta.com/blog/extend-pte-window/ | 2019 | M | |
| Employees with extended PTEP | 5% -> 11% over four years | Carta | https://carta.com/learn/equity/leaving-company/post-termination-exercise-period/ | 2024 | M | |

### C5. Preference terms

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| 1x non-participating share of Series A deals | ~70% of Carta-tracked deals | Carta deal terms Q1 2024 via HSBC Innovation Banking | https://www.hsbcinnovationbanking.com/en/resources/a-deep-dive-into-liquidation-preferences ; https://carta.com/data/deal-terms-q1-2024/ | 2024 | M | Carta survivor bias; priced rounds only |
| Non-participating with 1x multiple | 97% (2024), 96% (2025) | Carta/HSBC (UK data cited alongside) | same | 2025 | M | partly UK |
| Participating preferred | "largely off-market" at early stage; 82% of participating shares carry 1.0x | same | same | 2025 | M | |
| Structure persistence 2024 | >1x multiples and participation rose in down rounds but remain minority | Carta | https://carta.com/data/deal-terms-q1-2024/ | 2024 | M | |

---

## D. Cash pay

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Startup avg new-hire salary, product and engineering | $189,000 (all levels) | Carta comp H1 2025 | https://carta.com/data/startup-compensation-h1-2025/ | 2025 | M | Carta survivor bias; all levels, not new grad |
| Startup salaries YoY | +~5% 2024-25; AI engineers rising fastest | Carta | https://carta.com/data/q2-compensation-ai-engineers/ | 2025 | M | |
| Big-tech new-grad TC | Google $200-255K, Meta $225-285K, Amazon $205-225K, Microsoft $180-215K | Simplify | https://simplify.jobs/blog/startup-vs-big-tech-new-grad-engineers | 2026 | E | self-reported offers |
| Levels.fyi entry-level TC median | ~$140K (base $110-130K plus sign-on and stock) | Levels.fyi via Medium summary | https://medium.com/lets-code-future/what-companies-actually-pay-new-grads-in-2025-4132eec71a55 | 2025 | M | |
| Startup new-grad base | $100-180K | Simplify | same | 2026 | E | |
| Startup vs big-tech discount, new grad TC | 20-40% (cash discount smaller, ~10-25%; the rest is illiquid equity) | Simplify, whatisthesalary | https://whatisthesalary.com/it-salaries/startup-vs-big-tech-software-engineer-salaries-in-us/ | 2026 | E | |
| Founder CEO salary, seed | $147K (2025), $153K (2026); $132K (2024) | Kruze, payroll data from 450 startups | https://kruzeconsulting.com/blog/startup-ceo-salary-report/ | 2026 | M | Kruze clients are VC-backed |
| Founder CEO salary, Series A | $203K (2025 and 2026), up from $179K (2024) | Kruze | same | 2026 | M | same |
| All-stage average CEO salary | $161K (2025), up 14% from $141K | Kruze via PRNewswire | https://www.prnewswire.com/news-releases/startup-ceo-salaries-reach-record-highs-in-2025-302424494.html | 2025 | M | |

---

## E. Tenders and secondaries

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Tender offers on Carta, 2025 | 396 (+62% vs 2024); ~20% at Series E+ | Carta State of Private Markets 2025 in Review | https://carta.com/data/state-of-private-markets-q4-2025/ | 2026 | M | Carta runs tenders as a product; counts only its own |
| Employees paid via tenders 2025 | ~16,000 | Carta | https://carta.com/data/linkedin-startup-tender-offers-employee-liquidity-2025/ | 2026 | M | |
| H1 2026 activity | four-year high | Carta | https://carta.com/data/tender-offer-update-h1-2026/ | 2026 | M | |
| Median participation rate H1 2025 | 56% overall; 46.4% at seed-B; 65.6% at Series C+ | Carta | https://carta.com/data/tender-offers-q2-2025/ | 2025 | M | |
| Cap on share of holdings sellable | typically 10-25%; only 23% of tenders let sellers sell >50% | Carta tender guide; NewView Capital | https://carta.com/learn/equity/liquidity-events/tender-offer/ ; https://www.nvc.vc/insights/inside-the-tender-offer | 2025 | M | |
| Examples | Revolut 20% cap; Databricks 40-60% | PitchBook | https://pitchbook.com/news/articles/employees-at-mega-ipo-candidates-are-opting-out-of-tender-offers-in-a-champagne-problem | 2025 | M | |
| ESTIMATE share of companies running a tender in a year | ~1% of all Carta companies (396 of roughly 40-50K); ~8-12% of Series C+ companies; ~25%+ of Series E+ | reasoning from counts above | | | E | |

---

## F. PE-backed companies

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Net employment change, 2 yr post-buyout | -1% net at firm level (establishment-level -3%, offset by new establishments); 3,200 targets, 150,000 establishments, 1980-2005 | Davis, Haltiwanger, Handley, Jarmin, Lerner, Miranda, AER 2014 | https://www.aeaweb.org/articles?id=10.1257%2Faer.104.12.3956 | 2014 | M | pre-2005 buyouts |
| Heterogeneity by deal type | employment -13% in public-to-private, +13% in private-to-private over 2 yr; earnings per worker -1.7%; productivity +8% (from abstract; verify against paper) | Davis et al., NBER w26371 (2019) / "The (Heterogeneous) Economic Effects of PE Buyouts" | https://www.nber.org/papers/w26371 | 2019 | M | 1980-2013 buyouts |
| Holding period | avg 6.4 yr (2025); median 6.0 yr, longest on record; "~7 years" | S&P Global; PitchBook; CapitalPad | https://www.spglobal.com/market-intelligence/en/news-insights/articles/2025/12/private-equity-buyouts-record-longer-holding-periods-in-2025-96348743 ; https://capitalpad.com/private-equity-holding-period-statistics/ | 2025 | M | current backlog inflates |
| Secondary buyouts as share of PE exits | 30.5% of exit count Q1 2024 (25.2% Q1 2023); 38% of exit value 2024; IPOs 12%; bankruptcies >2% | PitchBook; Financier Worldwide | https://pitchbook.com/news/articles/private-equity-uptick-secondary-buyouts ; https://www.financierworldwide.com/secondary-buyouts-dominate-pe-exits | 2024-25 | M | |
| Sponsor-to-sponsor exits 2025 | +21% globally (North America would be -19% ex Aligned Data Centers) | Bain Global PE Report 2026 | https://www.bain.com/about/media-center/press-releases/2026/private-equity-resurgence-gathers-steam-as-new-era-challenges-firms-to-enhance-value-creationbain--company-global-pe-report/ | 2026 | M | |
| MIP pool size and reach | 15-20% of common (some sources 8-12%), among "a small group of senior executives and critical employees", CEO often ~half | Equiom; V7; CT Acquisitions | https://www.equiomgroup.com/news/management-incentive-plans-private-equity-aligning-interests-growth-retention ; https://www.v7labs.com/blog/management-incentive-plan-private-equity-portfolio | 2025-26 | E | practitioner guides |
| ESTIMATE rank-and-file (new grad) MIP participation | ~0-2% of employees; a new grad gets none. Some PE-backed companies (KKR "broad-based ownership" program) grant small awards to all staff, but that is a minority | reasoning | https://www.kkr.com/ | | E | |

Comp effects for a rank-and-file employee: Davis et al. show earnings per worker roughly flat to slightly down (-1.7%) with cash bonus programs common at the management layer. Treat PE cash pay as market (discount ~0) with higher job-loss hazard in public-to-private deals.

---

## G. Bootstrapped / family-funded

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Establishment survival | 77.9% 1 yr; 51.4% 5 yr; 34.7% 10 yr | BLS BED through Mar 2025 | https://www.bls.gov/spotlight/2024/business-employment-dynamics-twentieth-anniversary/home.htm | 2025 | M | closure counts sales and retirements: upper bound on failure |
| Employee ownership and pay | "employee ownership tends to come on top of market levels of pay, rather than replacing wages" | Rutgers Institute for Employee Ownership; Kruse/Blasi | https://smlr.rutgers.edu/faculty-research-engagement/institute-study-employee-ownership-and-profit-sharing ; https://www.tandfonline.com/doi/full/10.1080/02692171.2025.2491926 | 2025 | M | ESOP firms, not general small firms |
| Profit sharing in family firms | cash profit sharing more common than equity in closely held/family firms; families "wish to maintain substantial equity ownership" | family-firm literature via tandfonline; FBCG | https://www.thefbcg.com/resource/paying-family-in-a-family-business-where-good-intentions-create-hidden-risks/ | 2025 | E | |
| ESTIMATE equity prevalence for a non-family employee | ~5-10% receive any equity or phantom equity; ~20-30% get cash profit share | reasoning from above | | | E | |
| ESTIMATE pay vs market | 10-25% below large-company cash for the same title in small private firms (BLS NCS shows small establishments pay less; not fetched) | reasoning | https://www.bls.gov/ncs/ | | E | |

---

## H. Stage mix of new-grad startup hires

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Headcount by stage (Carta averages, 2025) | seed 6.2; A 16.8; B 48.2; D 131 | Carta State of Seed; Carta comp H2 2025 | https://carta.com/data/startup-compensation-h2-2025/ | 2025 | M | Carta survivor bias |
| ESTIMATE company counts by stage (active US VC-backed) | seed ~4x Series A count; A ~1.7x B; B ~1.5x C+ (from A3 graduation rates and A2 timing) | reasoning | | | E | |
| ESTIMATE employee-weighted stage mix | seed ~12%, A-B ~33%, C+ ~55% of VC-backed startup employees | reasoning: multiply company counts by headcount | | | E | |
| ESTIMATE new-grad-weighted mix | seed 10%, A-B 30%, growth 60% | reasoning: growth companies run campus recruiting and hire in cohorts; seed companies hire senior generalists and rarely take new grads (median time to first hire is 284 days and the first hire gets 1.5%, a senior grant) | | | E | |

---

## I. Founder outcomes

| item | value | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|
| Share of founders whose company records an exit | ~11% of portfolio companies (Dealum); ESTIMATE ~10-15% for seed-funded founders over 10 years | Dealum | https://blog.dealum.com/mid-market-startup-acquisition/ | 2025 | M / E | |
| Founder team ownership by stage | 56.2% seed, 36.1% A, 23.0% B, 16.1% C, 11.4% D | Carta Founder Ownership 2026 | https://carta.com/data/founder-ownership-2026/ | 2026 | M | Carta survivor bias |
| ESTIMATE founder team ownership at exit | ~10-15% at IPO (team; CEO ~5-8%); ~25-40% at a Series A/B-era acquisition | reasoning from ladder above | | | E | |
| Co-founder departures | 24% of startups lose a founder by year 4; ~38.9% by year 8 | Carta via SaaStr | https://www.saastr.com/the-state-of-seed-today-10-key-learnings-from-cartas-latest-data/ | 2025 | M | |
| ESTIMATE time to failure | median ~3-4 years from seed for companies that fail (shutdowns cluster after seed runway of 2-3 years plus a bridge) | reasoning from A2 and SimpleClosure | https://simpleclosure.com/blog/insights/state-of-startup-shutdowns-2025/ | | E | |
| Founder cash at exit | Kruze walks through pref stack and taxes; founder receives far less than headline | Kruze | https://kruzeconsulting.com/founder-selling-exit/ | 2025 | E | |

---

## Suggested parameter values

All annual hazards are per company-year conditional on the company being alive and private at the start of the year. Exit values are enterprise/headline values in USD; the simulation should subtract prefStack (1x non-participating, ~96% of rounds) before allocating to common, and convert non-participating preferred to common when that pays more. "Fail" means the equity is worthless (shutdown, acquihire below the stack, or zombie). Every number below is an ESTIMATE derived from the sections above; Carta-derived anchors carry survivor bias and I have shaded them toward the pessimistic side.

| parameter | seed | seriesAB | growth | bootstrapped | pe | rationale |
|---|---|---|---|---|---|---|
| failHazard (annual) | 0.16 | 0.10 | 0.05 | 0.08 | 0.03 | Seed: ~50% reach A in 4 yr, most of the rest die or acquihire -> 5-yr cumulative ~58%. A-B: ~60% per-round graduation over ~2 yr -> ~10%/yr. Growth: 62% of Series C cohort had no exit at 10 yr; assume ~40% are dead -> ~5%/yr. Bootstrapped: BLS 10-yr survival 35% -> ~10%/yr churn, but an employee joins after year 1 and closure includes sales, so 8%. PE: bankruptcies ~2% of exits plus distress; 3%. For PE add a separate job-loss hazard: 0.07/yr in years 1-2 (Davis: -13% employment in public-to-private, -1% net overall). |
| exitHazard (annual) | 0.04 | 0.07 | 0.09 | 0.03 | 0.17 | Seed exits are mostly small and come after progression; A-B: M&A dominates (94% of exits by count); growth: 38% exit within a decade of Series C plus IPO window reopening in 2025-26; bootstrapped: small-business sale; PE: median hold 6.0 yr -> 1/6. |
| exitMedian ($) | 30M | 80M | 400M | 8M | 300M | 92% of VC M&A is < $50M, so a seed-era exit median near $30M is generous; A-B median sits near the post-B valuation; growth reflects Series C+ post-money ~$300-400M with IPO upside; bootstrapped median is a small-business sale at ~1-2x revenue; PE assumes ~2x entry EV on a ~$150M entry. |
| exitSigma (lognormal) | 1.6 | 1.5 | 1.3 | 1.2 | 1.0 | Fit to "92% < $50M, 3.6% >= $500M" at the population level (sigma ~1.7); tightens with stage. PE returns are compressed (leverage, 2-3x MOIC target). |
| prefStack ($ raised by exit) | 6M | 70M | 200M | 0 | debt = 50% of EV | Seed: pre-seed ~$1.5M + seed ~$4M. A-B: $4M + $20M + $40M rounded plus bridges. Growth: add a $70-100M C and part of a D. PE: model leverage as a senior claim of ~50% of entry EV instead of preferred. |
| grantPctFD, eng new grad | 0.20% | 0.05% | 0.006% | 0 (10% chance of 0.5%) | 0 | Seed: hire ~6-15 at 0.1-0.3% (Carta hire #6 ~0.3% for a senior; new grad below). A-B: Index OptionPlan junior engineer ~0.05-0.1% at A; midpoint of A and B. Growth: RSU package ~$40-60K over 4 yr on a $700M-1B company. Bootstrapped: rare. PE: MIP is management-only. |
| grantPctFD, non-eng new grad | 0.10% | 0.025% | 0.003% | 0 | 0 | Carta: business hires at the middle/lower end; roughly half the engineering grant across stages. |
| strikeFrac (409A / preferred) | 0.20 | 0.30 | 0.60 | n/a | n/a | Practitioner rules of thumb: ~20% at A, ~30% at B, converging to 70-90% pre-IPO; RSUs at growth need no strike, so strikeFrac applies only to the ~50% of growth grants that are options. |
| salaryDiscount vs big-tech new-grad TC | 0.30 | 0.20 | 0.10 | 0.20 | 0.02 | Big-tech new-grad TC ~$180-250K; startup base $100-180K. Cash-only discount is ~10-25% by stage; the larger TC gap is illiquid equity, which the simulation values separately. PE pays market cash with bonus (Davis: earnings per worker -1.7%). |
| secondaryProb (annual, chance a tender you can sell into occurs) | 0.01 | 0.03 | 0.10 | 0 | 0 | ~1% of all Carta companies ran a tender in 2025; ~8-12% of Series C+; participation 46% at seed-B, 66% at C+. Apply a sale cap of 20% of vested holdings per tender (typical 10-25%). |
| pExerciseOnLeave | 0.45 | 0.30 | 0.25 (options) / 1.0 (RSUs) | n/a | n/a | Carta: 32% of vested in-the-money grants exercised (Q4 2024), 28% during PTEP; cheap seed strikes raise the rate, large growth-stage exercise costs plus AMT lower it. 91% of grants have a 90-day window; 11% of employees have extended windows. |
| dilutionPerRound (to an existing holder, incl. pool refresh) | 0.22 (seed->A) | 0.20 (A), 0.17 (B) | 0.13 (C), 0.11 (D+) | 0 | 0 | Carta medians: seed 19.5%, A 18%, B 14%, C 10%, plus 2-4 pts of option-pool top-up each round. |
| yearsPerRound | 2.1 | 2.0 | 2.0 | n/a | n/a (hold 6) | Carta: seed-to-A median 2.1 yr in 2025 (39% of the Q3 2025 cohort took 3+ yr); A-to-B and later assumed ~2 yr. |
| stageMix (share of new-grad startup joiners) | 0.10 | 0.30 | 0.60 | separate track | separate track | Employee-weighted mix is ~12/33/55; shift toward growth because campus recruiting is a growth-stage activity. Bootstrapped and PE are alternative tracks the user chooses, not part of the VC mix. |

Additional modeling notes:

1. Stage progression. A seed hire's company should step up the ladder with probability ~0.50 per 2 years (seed->A) and ~0.60 per round afterward, with each step applying dilutionPerRound, adding to prefStack, raising exitMedian, and lowering failHazard. This matters more than any single hazard.
2. Common gets residual. With 1x non-participating preferred (~96% of shares), common receives max(0, exit - prefStack) x common share, unless preferred converts (exit > prefStack / preferred ownership). Do not model participating preferred at all for VC stages; it is off-market.
3. Leaver behavior. New grads change jobs; median tenure at startups is ~2 years (not sourced here, treat as an input). On departure apply pExerciseOnLeave; unexercised options are forfeited. Exercise cost = strikeFrac x preferred price x shares; add AMT drag of ~10-20% of spread for ISOs at growth stage.
4. Vesting: 4-year monthly with 1-year cliff is universal at all VC stages (Carta); PE MIP vests on exit; bootstrapped equity, when it exists, is usually phantom or profit interest.
5. Bias direction. Nearly every anchor comes from Carta, which is survivor-conditioned and AI-inflated in 2025-26. The suggested parameters shade failHazard up and exitMedian down relative to Carta medians; a sensitivity run should push failHazard another +30% and exitMedian -30% to bracket a random (non-Carta) startup.
