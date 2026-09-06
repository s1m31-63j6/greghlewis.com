# Sourced inputs: benefits and wealth layer for the career-paths Monte Carlo

Compiled 2026-09-06. Companion to `sources_comp.md` and `sources_startup.md`. Scope: employer
retirement contributions, other benefit value, investment/savings/tax assumptions, wealth
benchmarks, and a cross-check of involuntary-separation hazards. All dollars are **2026 real
dollars** unless a row says otherwise; CPI-U 2026 anchor = 333 (2022 → ×1.138, 2025 → ×1.032).

Tags: **M** = measured (survey, payroll, administrative, or plan-document number as reported);
**E** = estimated (derived, blended, or my judgment). Every row carries a bias note.

Reading rule for section A: the model wants "% of base pay actually received by a typical employee
who contributes enough to get the full match." Survey averages (Vanguard, BLS) are lower than that
because they average over non-participants and under-contributors; company formulas are higher
because they assume the employee hits the cap. The suggested values reconcile the two.

---

## A. Employer retirement contributions

### A1. Corporate baseline

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Share of Vanguard plans providing any employer contribution | 96% | % of plans | Vanguard How America Saves 2025 (via ASPPA summary) | https://www.asppa-net.org/news/2025/8/a-robust-report-on-savings/ | 2024 data | M | plan-weighted; Vanguard's book skews to mid/large employers with a recordkeeper, so small firms are under-represented |
| Most common match formula | 50% of the first 6% of pay (3% effective); 68% of plans single-tier | formula | Vanguard HAS 2025 (via NerdWallet / Carry) | https://www.nerdwallet.com/retirement/learn/the-average-401k-balance-by-age | 2024 data | M | "most common" is a mode, not a mean |
| Average promised employer match value | 4.6% (median 4.0%) | % of pay | Vanguard HAS 2025 (via NerdWallet) | same | 2024 data | M | *promised* if the employee defers enough; plan-weighted; excludes nonelective in most summaries |
| Average total participant contribution rate (employee + employer) | 12.0% avg / 11.5% median; employee avg 7.7% → employer ≈ 4.3% | % of pay | Vanguard HAS 2025 (via ASPPA) | https://www.asppa-net.org/news/2025/8/a-robust-report-on-savings/ | 2024 data | M / E (subtraction mine) | participant-weighted across all participants incl. those not capturing the full match; so ~4.3% is a floor for "full-match" employees |
| Share of participants at the IRS deferral maximum ($23,000 in 2024) | 14% | % of participants | Vanguard HAS 2025 (via ASPPA) | same | 2024 data | M | rises steeply with income; among $150K+ earners it is roughly half (Vanguard reports ~50%+ for the top income band in prior editions) — E |
| BLS ECEC private industry, all workers: retirement & savings | $1.57/hr = 3.4% of total comp = **4.8% of wages** ($1.57/$32.60) | % of wages | BLS ECEC March 2026 | https://www.bls.gov/news.release/ecec.htm | 2026 | M (ratio mine) | includes DB pension cost and non-participants; employer cost, not employee receipt |
| BLS ECEC management, professional & related | $2.89/hr = 3.7% of comp = **5.4% of wages** ($2.89/$53.50) | % of wages | BLS ECEC March 2026 | same | 2026 | M (ratio mine) | includes DB cost (skews public-adjacent and legacy F500 up); averages over non-participants (skews down) |
| BLS ECEC information industry | $3.54/hr = **6.6% of wages** | % of wages | same | same | 2026 | M (ratio mine) | information ≈ tech + media + telecom; telecom carries legacy DB cost |
| BLS ECEC professional & business services | $1.94/hr = **4.7% of wages** | % of wages | same | same | 2026 | M (ratio mine) | includes staffing/temp agencies which dilute it |
| Fidelity total 401(k) savings rate | ~14.3% total = ~9.5% employee + ~4.8% employer (Q1 2025); Q2 2026 release headlines "record savings rates" | % of pay | Fidelity quarterly retirement analysis | https://newsroom.fidelity.com/pressreleases | 2025–26 | E | Q1 2025 figures from memory of the release; the Q2 2026 release (Sept 3, 2026) could not be opened; Fidelity's book skews large-employer |

### A2. Big tech formulas

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Google | 50% of contributions up to the IRS limit (max $12,250 in 2026), or 100% of first $3,000 if greater; immediate vesting | formula | Levels.fyi 401k benefits page; Carry | https://www.levels.fyi/benefits/401k/ | 2026 | M | aggregator of employee reports, generally accurate for large firms |
| Meta | 50% up to IRS limit; immediate vesting | formula | same | same | 2026 | M | as above |
| Microsoft | 50% up to IRS limit; immediate vesting | formula | same | same | 2026 | M | as above |
| Apple | 50% of first 6% (years 0–2), 75% (2–5), 100% (5+) | formula | Built In / Levels.fyi | https://builtin.com/company-culture/companies-with-best-401k-match | 2025 | M | tenure-tiered; new grads get 3% |
| Amazon | 50% of first 4% = 2% effective; 3-year cliff vesting | formula | digitalcalculator / Blind threads | https://www.digitalcalculator.info/401k-retirement-calculator/employer-match-by-company/ | 2026 | M | widely corroborated; the stingy outlier |
| Big-tech blend, employee who maxes ($24,500 on ~$160K base) | G/M/MSFT ≈ 7.7% of base; Apple 3%; Amazon 2% → weighted (50/25/25) **≈ 5.3%** | % of base | derived | – | 2026 | E | weights are my guess at where new grads land; a 10%-deferral employee gets ≈ 3.9% under the same blend |
| Big-tech blend, effective incl. non-maxers | **≈ 4.5–5.5%** | % of base | derived | – | 2026 | E | the 50%-to-limit design means the match scales with the employee's own saving |

### A3. Consulting formulas

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| McKinsey Profit Sharing Retirement Plan (PSRP) | nonelective; "historically 12% of salary, set annually by the board"; recent employee reports say 7.5% of salary regardless of own contribution; Form 5500 shows employer contributions ≈ 50% of employee contributions in 2023 | % of salary | MyConsultingOffer; Glassdoor forum; MyPlanIQ (Form 5500) | https://www.myconsultingoffer.org/cover-letter/mckinsey-benefits/ ; https://www.myplaniq.com/invest/plancontribution-match/mckinsey-company-inc-psrp-profit-sharing-retirement-plan | 2023–25 | M (formula), E (level) | the 12% is a historical high-water mark; 7.5% is the more recent employee-reported level; a Fishbowl thread cites "~$20K regardless of contribution" for consultants |
| BCG | nonelective profit-sharing into 401(k): 5% of base+bonus for associates/consultants, 10% project leader/principal, 15% MD; plus 25% match on first 6% (1.5%); vests immediately | formula | Fishbowl; MyPlanIQ; Glassdoor | https://www.fishbowlapp.com/post/whats-bcg-401k-match | 2024–25 | M | employee-reported; one source claims a flat 10% profit share for all levels, which I treat as the older/upper bound |
| Bain | 4.5% of total comp nonelective, no employee contribution required | formula | Fishbowl; roadtooffer | https://www.roadtooffer.com/blog/bain-salary | 2025 | M | employee-reported; whether a separate match exists on top is not confirmed |
| Deloitte | 25% of first 6% (1.5% effective) | formula | MyPlanIQ; Glassdoor | https://www.myplaniq.com/invest/plancontribution-match/deloitte-401k-plan/ | 2025 | M | corroborated by multiple threads ("pretty bad") |
| EY | 25% of first 6% after 1 year (1.5%); 50% of first 6% after 4 years (3%) | formula | Beagle; Fishbowl | https://meetbeagle.com/resources/post/401-k-match | 2025 | M | one-year wait matters for a 2-year tenure |
| PwC | 25% of first 6% match plus "Wealth Builder" nonelective (reported "up to 8%"; commonly ~3% at junior levels) | formula | Fishbowl; Glassdoor | https://www.fishbowlapp.com/post/whats-the-401k-match-for-everyone-pwc-deloitte-kpmg-ey-rsm-bdo-crowe-etc | 2025 | E | Wealth Builder is service-tiered; junior level ≈ 1.5% + 3% |
| KPMG | automatic 6–8% firm contribution (replaced match in 2021, pension frozen) | formula | memory of KPMG Oct-2021 benefits announcement; not re-verified this session | – | 2021 | E | if wrong, treat KPMG as 3% |
| Accenture | 100% of first 6% after 12 months of service | formula | Carry | https://carry.com/learn/accenture-401k-match | 2026 | M | the 12-month wait means year 1 = 0 |
| MBB blend, new-grad level | (7.5 + 6.5 + 4.5) / 3 **≈ 6.2%**, rising to 8–10% at manager level | % of pay | derived | – | 2025 | E | McKinsey level is the swing factor (7.5–12%) |
| Big 4 blend, junior level | (1.5 + 1.5 + 4.5 + 6) / 4 **≈ 3.4%**; ~2.5% if KPMG is 3% | % of pay | derived | – | 2025 | E | all four impose 1-year waits and/or 3-year vesting on the match portion |

### A4. Startups by stage

No source publishes 401(k) offering or match rates by funding round. The evidence is by employer
size, with VC-backed tech well above the small-business average.

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Retirement plan access, private establishments 1–49 workers | 55% (59% for <100) | % of workers | BLS Employee Benefits in the US, March 2025 | https://www.bls.gov/news.release/archives/ebs2_09252025.htm | 2025 | M | all industries; tech startups are far above this (a plan is near-free after SECURE 2.0 credits) |
| Access, 50–99 / 100–499 / 500+ | ~71% / 86% / 90% | % of workers | same | same | 2025 | M | as above |
| Access, management/professional occupations | 87% access, 75% participation, 86% take-up | % | same | same | 2025 | M | occupation cut, all sizes |
| Small businesses (1–50 employees) offering a 401(k) | 24% | % of firms | ShareBuilder 401k survey (BusinessWire) | https://www.businesswire.com/news/home/20240603509043/en/Only-24-of-Small-Businesses-Offer-a-401k-Plan-According-to-Survey | 2024 | M | vendor survey of all small businesses; the floor, not the startup number |
| BLS ECEC employer retirement cost, 1–49 workers | $0.87/hr = 2.3% of comp = **3.1% of wages** | % of wages | BLS ECEC March 2026 | https://www.bls.gov/news.release/ecec.htm | 2026 | M (ratio mine) | averages over the 45% with no plan; among firms with a plan ≈ 5–6% |
| Same, 50–99 / 100–499 / 500+ | 3.8% / 4.8% / 7.3% of wages | % of wages | same | same | 2026 | M (ratio mine) | 500+ includes 36% DB access, so DC-only is nearer 5% |
| Typical benefits gross-up at seed–Series B (health + 401k) | 10–15% of cash comp | % | Kruze/startupCFO founder-salary report | https://www.startupcfo.ai/insights/startup-founder-salary-report-2026 | 2026 | E | vendor blog; mostly health |
| Anecdote: Series C startup with 0% match | "normal" per respondents | – | Quora thread | https://www.quora.com/Is-it-normal-for-a-startup-that-just-raised-its-series-C-and-started-a-401-k-plan-to-not-match-the-employees-contributions-0-match | n.d. | E | anecdote; consistent with "plan but no match" being the modal growth-stage design until late |
| Seed: P(plan) × P(match | plan) × match | ≈ 0.55 × 0.30 × 3.5% **≈ 0.6%** | % of pay | derived | – | 2026 | E | seed plans are usually Guideline/Human Interest with no match; when a match exists it is a 3–4% safe harbor |
| Series A–B | ≈ 0.85 × 0.45 × 3.5% **≈ 1.3%** | % of pay | derived | – | 2026 | E | Series B is where safe-harbor matches start appearing to pass testing |
| Growth / Series C+ | ≈ 0.95 × 0.65 × 4% **≈ 2.5%** | % of pay | derived | – | 2026 | E | late-stage (Stripe/Databricks tier) matches cluster at 50% of 6% or 3–4% flat; some still zero |

### A5. PE-backed and bootstrapped

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Bootstrapped small business (<50 employees, has a plan) | ≈ 3% safe-harbor nonelective or 4% match; blended with 45% no-plan → **≈ 2%** expected | % of pay | derived from BLS 1–49 cost (3.1% of wages) | https://www.bls.gov/news.release/ecec.htm | 2026 | E | owner-funded firms commonly adopt 3% safe harbor to let the owner max; a professional employee sees 2–4% |
| PE-backed portfolio company (typically 100–2,000 employees) | ≈ BLS 100–499 band 4.8% of wages incl. DB; PE sponsors freeze DB and standardize at 50% of 6% → **≈ 3.5%** | % of pay | derived; Davis et al. (NBER w26371) on PE compensation cuts | https://www.nber.org/papers/w26371 | 2026 | E | no PE-specific benefits survey exists; Davis et al. find earnings per worker fall 1.7% post-buyout, benefits likely trimmed similarly |

### A6. Vesting

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Plans with immediate vesting of employer match | 43% (HAS 2025); 47–49% in other summaries | % of plans | Vanguard HAS 2025 via ASPPA; NAPA | https://www.asppa-net.org/news/2025/8/a-robust-report-on-savings/ ; https://www.napa-net.org/news/2025/2/do-401k-vesting-schedules-help-with-worker-retention/ | 2024 | M | plan-weighted; large plans are more often immediate, so participant-weighted is higher |
| Graded / cliff share; most common alternatives | 28% graded, 10% cliff; 5-year graded 16% of plans, 3-year cliff 9% | % of plans | same | same | 2024 | M | as above |
| Forfeitures occur in what share of job separations | 30% of separations; forfeitures average 40% of the affected participant's final balance | % | Vanguard research note "Does 401(k) vesting help retain workers?" (4.7M separations, 1,500 plans, 2010–22) | https://corporate.vanguard.com/content/dam/corp/research/pdf/does_401k_vesting_help_retain_workers.pdf | 2025 | M | Vanguard book; plans with vesting only for the 40% figure |
| Employer cost recouped by vesting | 2.5% of employer contributions at plans with vesting (25% of plans ≥4%, 10% >8%) | % | same | same | 2025 | M | small at the plan level, large for the individual who leaves early |
| Retention effect of 3-year cliff vs immediate | none detectable | – | same | same | 2025 | M | diff-in-diff, 181 cliff vs 425 immediate plans |
| Safe-harbor matches (dominant small-plan design) | must be 100% immediately vested (QACA variant may use 2-year cliff) | rule | IRS safe-harbor 401(k) rules (general knowledge) | https://www.irs.gov/retirement-plans/plan-sponsor/401k-plan-overview | – | E | means startup matches, when they exist, are effectively unvested-risk-free |
| Track-level vesting (from A2–A3) | big tech: immediate except Amazon 3-yr cliff; MBB: BCG immediate, McKinsey/Bain profit share reportedly 3-yr; Big 4/Accenture: 1-yr wait and/or 3-yr vesting; startups: immediate (safe harbor) | – | rows above | – | 2025 | E | McKinsey/Bain vesting is employee-reported and unverified |

Interaction with a 2–3 year tenure: under a 3-year cliff the employee who leaves at 2.5 years
forfeits 100% of the match; under 5-year graded (20%/yr) they keep 40%; under immediate they keep
all. Weighted by the plan mix above (43% immediate, 16% five-year graded, 9% three-year cliff, ~30%
other graded), a 2.5-year leaver keeps roughly **65–70%** of accrued employer money on average.

---

## B. Other benefit value differences

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Family premium, employer-sponsored, all firms | $26,993 (2025) → **$27,860**; worker pays $6,850 (26%) → employer share **$20,790** | $/yr | KFF Employer Health Benefits Survey 2025 | https://www.kff.org/health-costs/2025-employer-health-benefits-survey/ | 2025 | M | national average across all covered workers; plan richness not held constant |
| Family coverage, firms 10–199 vs 200+ | worker share 36% ($8,889) vs 23% ($6,227) → employer share ≈ **$18,700 vs $21,400** (2026$) | $/yr | KFF 2025 | same | 2025 | M (subtraction mine) | small-firm premiums are slightly lower on average, so the employer-share gap is ~$2.5–3K |
| Single premium | $9,325 (2025) → **$9,620**; worker share ≈ 16% → employer ≈ **$8,100** | $/yr | KFF 2025 summary | https://files.kff.org/attachment/Employer-Health-Benefits-Survey-2025-Annual-Survey-Summary-of-Findings.pdf | 2025 | M / E (worker share from prior years' 16–17%) | small firms often pay 100% of single coverage, so single-coverage employer share is roughly flat across size |
| BLS employer share of medical premium, private industry | 80% single / 69% family | % | BLS EBS March 2025 | https://www.bls.gov/news.release/archives/ebs2_09252025.htm | 2025 | M | consistent with KFF |
| BLS ECEC health insurance cost by size | 1–49: $2.31/hr (6.2% of comp); 500+: $6.36/hr (9.3%); mgmt/prof: $5.73/hr | $/hr | BLS ECEC March 2026 | https://www.bls.gov/news.release/ecec.htm | 2026 | M | includes non-participants; the 500+ premium reflects richer plans, not just a larger share |
| Defined-benefit pension access | 14% of private workers; 6% at <100, 36% at 500+ | % with access | BLS EBS March 2025 | same | 2025 | M | most 500+ DB plans are frozen to new hires; for a 2026 new-grad professional the open-DB probability is near zero outside utilities/insurers/some banks |
| ESPP: share of qualified plans with 15% discount / lookback | 85% / 83% | % of plans | Deloitte–NASPP ESPP survey 2023 (via NASPP blog) | https://www.naspp.com/blog/five-trends-in-espps | 2023 | M | survey of plan sponsors who answer NASPP; large-cap skew |
| ESPP participation | median 38% overall; 44–48% for 15%-with-lookback plans | % of eligible | NASPP; Equiniti | https://www.naspp.com/blog/espp-policies-and-participation | 2023 | M | as above |
| ESPP expected value for a corporate technical hire | 15% discount + lookback ≈ 15–20% gain on up to $21,250/yr of purchases; if offered (Microsoft, Apple, Accenture yes; Google, Meta, Amazon no) and 45% participation → **≈ $1,000–1,500/yr expected**, ~$3,500 if participating | $/yr | derived | – | 2026 | E | ≈ 0.5–1% of pay; only public companies; zero for consulting (partnerships) and private startups |
| Paid parental leave | big tech 16–24 weeks; MBB/Big 4 12–16 weeks; funded startups 12 weeks typical; small bootstrapped firms often FMLA-unpaid; private-industry paid family leave access ≈ 27% | weeks | company benefits pages (general knowledge); BLS EBS 2025 for the 27% | https://www.bls.gov/news.release/archives/ebs2_09252025.htm | 2025 | E | expected annual value ≈ weeks × weekly pay × P(child in year) ≈ 16 × $3,000 × 0.05 ≈ $2,400 at big tech vs ~$0 at a small firm |
| PTO | 15–20 days standard at all tracks; "unlimited" at most startups; consulting effectively less usable | days | general knowledge | – | 2026 | E | a wash in dollars |

**Which differ enough to matter.** (1) Employer retirement contributions: yes, 0–8% of pay is
the biggest benefit spread and compounds. (2) Employer health share: single coverage is roughly a
wash; family coverage differs by ~$2.5–3K/yr in favor of large employers, plus plan richness
(platinum at big tech vs silver at seed) worth maybe another $1–2K — modest, and it only bites
after the family years begin. (3) ESPP: ~0.5–1% of pay, public corporate only; include as a small
corporate-technical add-on or ignore. (4) Pension: ignore (near-zero prevalence for this cohort).
(5) Parental leave and PTO: wash in expected dollars; not worth modeling.

---

## C. Investment return, savings, tax, and wealth benchmarks

### C1. Real returns

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| S&P 500 incl. dividends, 1928–2025 | 10.02% geometric nominal (11.86% arithmetic); **≈ 6.8% real** using CPI 17.4 (1927) → 322.6 (2025) = 3.02%/yr | %/yr | Damodaran annual return table (computed by me from the 98 annual rows) | https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html | 2026 | M (nominal) / E (real, CPI anchors from memory) | survivorship: the US is the best-performing major market of the century |
| 10-yr T-bond / 3-mo T-bill, 1928–2025 | 4.53% / 3.37% nominal → ≈ 1.5% / 0.3% real | %/yr | same | same | 2026 | M / E | as above |
| 60/40 (S&P / 10-yr bond, rebalanced annually), 1928–2025 | 8.34% nominal → **≈ 5.2% real** | %/yr | same, computed | same | 2026 | E | as above |
| Same series, 1975–2025 | equities 12.37% nominal / ≈ 8.3% real; 60/40 ≈ 6.3% real (CPI 49.3 → 322.6 = 3.75%/yr) | %/yr | same, computed | same | 2026 | E | a favorable window (falling rates 1981–2021) |
| World equities, 1900–2024 | US ≈ 6.6% real; world ≈ 5.2% real; bonds ≈ 1.6%; bills ≈ 0.5% | %/yr | UBS (ex-Credit Suisse) Global Investment Returns Yearbook | https://www.ubs.com/global/en/investment-bank/in-focus/2025/global-investment-returns-yearbook.html | 2025 | E | figures from memory of the 2024/25 editions (page could not be fetched); the ~1.4-pt US-vs-world gap is the survivorship haircut |
| Vanguard VCMM 10-year outlook, US equities | 3.9–5.9% nominal/yr; US aggregate bonds ≈ 4% nominal; VEMO tilts 40/60 | %/yr | Vanguard 2026 economic and market outlook (Dec 31, 2025 run) | https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/2026-outlook-economic-upside-stock-market-downside.html | 2026 | M (model output) | valuation-driven; Vanguard has under-forecast US equities every year since 2012 |
| Morningstar 2026 survey of forecasters, US equities | roughly 4–7% nominal 10-yr across firms | %/yr | Morningstar "Experts Forecast Stock and Bond Returns: 2026 Edition" | https://www.morningstar.com/markets/experts-forecast-stock-bond-returns-2026-edition | 2026 | M (survey of models) | same valuation logic |
| Forward 35-year real return, ~80/20 young-professional portfolio | **4.5%** central; 3.0–6.0% sensitivity | %/yr | derived: first decade at ~2.5–3.5% real (VCMM), later decades reverting toward 5–6% (world history) | – | 2026 | E | this is the honest middle between "US 1928–2025" (~6.5% for 80/20) and "10-year CMAs" (~2.5–3%) |

### C2. Savings rates

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| Average 401(k) deferral rate | 7.7% (record); 25% defer >10%; total incl. employer 12.0% avg / 11.5% median | % of pay | Vanguard HAS 2025 via ASPPA | https://www.asppa-net.org/news/2025/8/a-robust-report-on-savings/ | 2024 | M | participants only (non-participants excluded); auto-escalation drives the rise |
| Share of participants maxing out | 14% overall | % | same | same | 2024 | M | strongly income-graded |
| BEA personal saving rate | 3.0% (July 2026); ~4–5% through 2024–25 | % of disposable income | BEA | https://www.bea.gov/data/income-saving/personal-saving-rate | 2026 | M | macro aggregate; excludes capital gains and counts DB accruals oddly; not comparable to a household's "savings rate" |
| Median saving rate by income quintile, SCF (5-yr change in wealth / income), ages 30–59 | Q1 −1.5%, Q2 9.5%, Q3 8.7%, Q4 14.4%, **Q5 26.5%, top 5% 36.8%, top 1% 49.4%** | % of income | Dynan, Skinner & Zeldes, "Do the Rich Save More?" JPE 2004, Table 3 (SCF 1983–89 panel) | https://www.nber.org/papers/w7906 | 2004 (1980s data) | M | includes capital gains on housing and stocks; old data, but the gradient is the durable finding |
| Same, PSID active saving (excl. capital gains) | Q4 5.4%, **Q5 10.6%**; active + pension: Q4 18.0%, **Q5 23.0%** | % of income | same, Table 3 | same | 2004 | M | "active + pension" is the cleanest analog to "what a professional puts away" |
| Same, CEX (income − consumption) | Q4 34.8%, Q5 45.5% | % of income | same, Table 3 | same | 2004 | M | biased up by income under-reporting; authors say so |
| Marginal propensity to save rises with income | coefficient on income positive in every dataset (e.g. SCF 0.017 per $10K) | – | same | same | 2004 | M | supports a windfall save-rate above the average save-rate for high earners |
| Windfall (bonus / equity payout) saving share, high earners | **≈ 0.70 of the after-tax amount** (range 0.5–0.85) | share | derived: Dynan et al. top-quintile/top-5% rates (27–37%) plus the standard finding that MPC out of transitory income for liquid high-income households is ~0.2–0.3 | – | 2026 | E | no direct study of tech-equity windfalls; anecdotally, IPO windfalls partly go to housing, which is still net worth |

### C3. Tax drag

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| 2026 federal brackets, single (post-OBBBA inflation adjustment) | 22% to ≈ $105.7K taxable; 24% to ≈ $201.8K; 32% to ≈ $256.2K; standard deduction ≈ $16.1K | – | IRS Rev. Proc. 2025-32 (from memory; not fetched) | https://www.irs.gov/newsroom | 2026 | E | ±$1K on thresholds; the model only needs the shape |
| FICA | 6.2% OASDI to ≈ $184.5K wage base + 1.45% Medicare (2.35% above $200K) | – | SSA 2026 COLA notice (memory) | https://www.ssa.gov/oact/cola/cbb.html | 2026 | E | wage-base value approximate |
| State income tax, typical for this cohort | CA 9.3% marginal ($60–350K); NY/NYC ≈ 10%; MA 5%; WA/TX/FL 0% → blended **≈ 5%** marginal | – | state schedules (general knowledge) | – | 2026 | E | tech skews CA/WA; consulting NY/Chicago/DC; the 5% blend is a guess at the mix |
| Combined marginal rate on the next $1 of wages | $100K: ≈ 22 + 5 + 7.65 = **35%**; $200K: 24 + 5 + 7.65 = **37%**; $250K: 32 + 5 + 1.45 = **38%** | % | derived | – | 2026 | E | ignores itemizing, credits, and the SALT cap |
| Combined *effective* rate on total wages | $100K ≈ **27%**; $150K ≈ **30%**; $250K ≈ **34%** | % | derived | – | 2026 | E | as above |
| Value of 401(k) pre-tax deferral | saves ~35–38% today, taxed at ~22–24% on withdrawal → ≈ 12–14 points of tax arbitrage plus tax-free compounding (worth ~0.5–1.0%/yr of return on that balance) | – | derived | – | 2026 | E | Roth choice changes the timing, not much the total |
| Rule of thumb for the model | **Track wealth pre-tax.** Savings = savingsRate × gross pay goes into one pre-tax bucket; employer contributions and equity proceeds go into the same bucket; report a "spendable" line = 0.75 × pre-tax wealth (0.78 for the lower-income paths, 0.70 for windfall-heavy startup paths). | – | derived | – | 2026 | E | the honest simplification: the sim compares tracks, and the tax wedge is similar across them except that equity windfalls are taxed as LTCG (≈ 20–24% federal + state) vs ordinary income on wages and RSUs |

### C4. SCF 2022 wealth benchmarks (Table 2 of the 2023 Bulletin; 2022$ → ×1.138)

| item | median 2022$ → 2026$ | mean 2022$ → 2026$ | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| All families | $192.9K → **$220K** | $1,063.7K → **$1.21M** | Federal Reserve SCF 2022, Bulletin Table 2 | https://www.federalreserve.gov/publications/files/scf23.pdf | 2022 | M | household, not individual; includes home equity, vehicles, DC balances; excludes DB and Social Security wealth |
| Age 45–54 | $247.2K → **$281K** | $975.8K → **$1.11M** | same | same | 2022 | M | as above |
| Age 55–64 | $364.5K → **$415K** | $1,566.9K → **$1.78M** | same | same | 2022 | M | as above |
| Age 35–44 | $135.6K → **$154K** | $549.6K → **$625K** | same | same | 2022 | M | the year-15 checkpoint |
| College degree (any age) | $464.6K → **$529K** | $2,003.4K → **$2.28M** | same | same | 2022 | M | all ages; college × age-45–54 is not tabulated; scaling the 45–54 median by the college/all ratio (2.41) gives a crude **≈ $680K** (2026$) |
| Income percentile 80–89.9 | $747.0K → **$850K** | $1,264.7K → **$1.44M** | same | same | 2022 | M | usual-income percentile; 2022 income cutoff for this band ≈ $140–190K household |
| Income percentile 90–100 | $2,556.2K → **$2.91M** | $6,629.6K → **$7.54M** | same | same | 2022 | M | top-decile household income median $378K (2022$); the mean is dragged by the top 1% |
| Income 60–79.9 | $307.2K → **$350K** | $636.8K → **$725K** | same | same | 2022 | M | where a mid-career non-technical corporate household often sits |
| Median household income, college degree / top decile | $117.8K / $378.3K (2022$) | – | SCF Table 1 | same | 2022 | M | for placing simulated year-30 pay on the SCF income ladder |

Sanity-check rule: a simulated corporate/consulting path with year-30 pay of $150–250K (2026$) is a
household in the 80–95th income percentile at age ~52. The SCF says such households hold a median
of roughly **$0.85M–1.7M** and a mean around **$1.4–3M** (2026$), *including* home equity and a
spouse. A single-earner financial-wealth simulation should land at maybe 50–70% of that: **median
$0.5–1.1M, mean $0.9–2M**, with startup paths showing a far fatter right tail and a lower median.

---

## D. Involuntary separation by track (cross-check of existing hazards)

| item | value | unit | source | url | year | tag | bias note |
|---|---|---|---|---|---|---|---|
| MBB total annual attrition | 15–20% (McKinsey "consistently around 20%") | %/yr | CaseCoach; hackingthecaseinterview | https://casecoach.com/b/up-or-out-policy-mckinsey-bcg-or-bain/ | 2025 | E | prep-site figures, but consistent with firm statements over decades |
| MBB counseled-out share | ≈ 1/3 of leavers → **≈ 6.7%/yr**; alternative framing "≈ 5% of a cohort every six months after year 1" → **≈ 10%/yr** | %/yr | CaseCoach; hackingthecaseinterview | https://www.hackingthecaseinterview.com/pages/mckinsey-up-or-out | 2025 | E | the split between voluntary and counseled is fuzzy: many "voluntary" exits are pre-emptive |
| Big 4 explicit layoffs | PwC 1,500 (2% of 75K US) May 2025 after 1,800 in Sept 2024 (≈ 2.4%); KPMG 330 (<4% of US audit) Nov 2024; Deloitte unspecified consulting cuts early 2025 | %/yr | thefinancestory; big4accountingfirms.com | https://thefinancestory.com/pwc-us-lays-off-1500-people-in-2025 | 2024–25 | M | these are announced cuts only; performance-based exits and "low-rating counseling" are additive and unpublished; driven by "historically low attrition" |
| Big 4 involuntary hazard (explicit + performance) | **≈ 4–6%/yr** | %/yr | derived | – | 2025 | E | Big 4 are not strict up-or-out below senior manager; still, the bottom rating band (~5–10%) is pushed each cycle |
| Consulting blend (50% MBB / 50% Big 4) | **≈ 6–8%/yr** involuntary | %/yr | derived | – | 2025 | E | model currently uses 10%/yr counseled-out via gate pass rates; that is at the high end but defensible for an MBB-weighted track |
| JOLTS layoffs & discharges, monthly rate | PBS 1.7% (Mar 2025) → 2.4% (Mar 2026); Information 1.3% → 2.4%; all private 1.0% → 1.2% | % of employment per month | BLS JOLTS via Indeed Hiring Lab | https://www.hiringlab.org/2026/05/05/march-2026-jolts-report-stable-depending-on-what-you-do/ | 2026 | M | monthly rates; annualized ≈ 12–29%, but that covers temp/staffing, retail-like churn, and short-tenure workers; March 2026 includes Meta's 10% cut |
| JOLTS annual-average tables | Table 24 (annual average layoffs & discharges rates by industry) | – | BLS | https://www.bls.gov/news.release/jolts.t24.htm | 2025 | M | the model's existing citation; professional-services 2025 ≈ 2.0%/mo per params.json note |
| Big-tech professional layoff rates 2023–26 | Amazon ≈ 14K of ~350K corporate (4%, 2025); Microsoft ≈ 15K of 228K (≈ 6.6%, 2025); Meta 10% (2026); Google low single digits | %/yr | layoffs.fyi / TechCrunch tracker | https://techcrunch.com/2025/12/22/tech-layoffs-2025-list/ | 2025–26 | M | announced headcount over total headcount; a tenured professional's personal hazard is a bit lower than the headline |
| layoffs.fyi totals | 2025: 122,549 across 257 companies; 2024: 152,922 across 551; (2023 ≈ 264K; 2022 ≈ 165K) | employees | layoffs.fyi | https://layoffs.fyi/2025-layoffs/ | 2025 | M | global, includes big tech; startup-only share perhaps 40%; denominator (US tech employment ~5–6M) implies ≈ 2–4.5% of tech employment per year |
| Carta startup shutdowns | 769 (2023) → 966 (2024), +25.6%; Series A share of SimpleClosure shutdowns 6% → 14% (2024→25) | companies/yr | Carta via TechCrunch; SimpleClosure | https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests | 2025 | M | Carta customers only (~45K companies), so ≈ 2%/yr of all Carta companies but a higher share of *funded, staffed* ones; Carta's 2025 report was 403 this session |
| Corporate professional annual involuntary hazard | **≈ 4–5%** (tech 5%, non-tech 4%) | %/yr | derived: JOLTS scaled by ~1/3 for tenured professionals; corroborated by big-tech announced cuts of 3–7%/yr and F500 non-tech 2–4% | – | 2026 | E | matches the model's 0.045 |
| Startup involuntary hazard (shutdown + layoff), per stage | seed ≈ 16% + 4–5% ≈ **20%**; Series A–B ≈ 10% + 7% ≈ **17%**; growth ≈ 5% + 8% ≈ **13%**; bootstrapped ≈ 8% + 4% ≈ **12%**; PE ≈ 3% + 7% ≈ **10%** | %/yr | model's own fail/layoff hazards (sources_startup.md) cross-checked against Carta shutdown counts and layoffs.fyi | – | 2026 | E | seed layoffs and seed shutdowns overlap heavily; if anything trim the seed layoff hazard to 0.04 |

Per-track annual "lose your job involuntarily" hazard, with reasoning:

| track | hazard | reasoning |
|---|---|---|
| corporate technical | 0.05 | JOLTS information ≈ 1.0–1.3%/mo before the 2026 spike; scaled to tenured professionals ≈ 4–5%; big-tech announced cuts ran 3–7%/yr 2023–26 |
| corporate nontechnical | 0.04 | F500 non-tech restructurings run 2–4%/yr; JOLTS PBS scaled by a third |
| consulting (MBB-weighted) | 0.08–0.10 | counseled out ≈ 6.7–10%/yr; Big 4 ≈ 4–6% incl. explicit cuts; keep 0.10 if the track is MBB-first, 0.08 for an even blend |
| startup seed | 0.20 | shutdown dominates; layoff-without-shutdown is rare at 4 people |
| startup Series A–B | 0.17 | Series A share of shutdowns rising; 2022–25 layoffs concentrated here |
| startup growth | 0.13 | fewer shutdowns, more RIFs (layoffs.fyi's median company is Series C+) |
| bootstrapped | 0.12 | BLS establishment survival 51% at 5 yrs; slow to fire, no cushion |
| PE-backed | 0.10 | Davis et al.: −13% employment in public-to-private deals over 2 yrs; bankruptcy ≈ 2% of exits |

---

## Suggested parameter values

Keys match `params.json → benefits`. Values are % of base pay actually received by an employee who
defers enough to capture the full match, blended across the employers a new grad on that track
plausibly lands at.

| parameter | value | range | basis |
|---|---|---|---|
| employerRetirementPct.corporate.technical | **0.050** | 0.04–0.065 | big-tech blend ≈ 4.5–5.5% (A2), F500 tech-adjacent ≈ 4.6% promised match (A1); BLS mgmt/prof 5.4% of wages incl. DB. Existing 0.045 is fine; 0.05 credits the 50%-to-limit designs for a saver who maxes |
| employerRetirementPct.corporate.nontechnical | **0.050** | 0.04–0.07 | F500 non-tech: Vanguard promised 4.6%, BLS 500+ establishments 7.3% of wages (incl. DB); many F500 pay 3% nonelective + 50% of 6% after DB freezes. Keep 0.045 if the model wants the two personas equal to what they have now; the evidence does not separate them |
| employerRetirementPct.consulting.technical | **0.045** | 0.03–0.06 | technical consulting skews Big 4 / Accenture: Deloitte 1.5%, EY 1.5→3%, PwC ≈ 4.5%, KPMG 6–8%, Accenture 6% after year 1 → ≈ 3.5–4.5% |
| employerRetirementPct.consulting.nontechnical | **0.055** | 0.04–0.075 | MBB-weighted: McKinsey 7.5% (up to 12% historically), BCG 6.5% at consultant level, Bain 4.5% → 6.2%; blended 50/50 with Big 4's 3.4% → ≈ 4.8%; 0.055 leans MBB. The existing 0.07 is MBB-only and high for a blend |
| employerRetirementPct.startup.seed | **0.005** | 0–0.015 | P(plan) 0.55 × P(match) 0.30 × 3.5% |
| employerRetirementPct.startup.seriesAB | **0.015** | 0.005–0.025 | P(plan) 0.85 × P(match) 0.45 × 3.5% |
| employerRetirementPct.startup.growth | **0.025** | 0.015–0.04 | P(plan) 0.95 × P(match) 0.65 × 4% |
| employerRetirementPct.startup.bootstrapped | **0.020** | 0.01–0.035 | BLS 1–49 cost 3.1% of wages averaged over 45% with no plan; safe-harbor 3–4% when present |
| employerRetirementPct.startup.pe | **0.035** | 0.025–0.045 | BLS 100–499 band 4.8% of wages incl. DB, less PE benefit trimming |
| matchVestYears (scalar) | **2** (graded semantics: keep tenure/2 of accrued employer money, capped at 1) | 0–3 | plan mix 43% immediate / 16% 5-yr graded / 9% 3-yr cliff / ~30% other graded; a 2.5-year leaver keeps ~65–70% on average, which a 2-year linear grade reproduces |
| matchVestYears by track (if the model can carry it) | corporate tech 1 (G/M/MSFT immediate, Amazon 3-yr cliff); corporate nontech 3 (F500 typical 3-yr cliff or 5-yr graded); consulting 3 (Big 4 wait + vest; McKinsey/Bain profit share reported 3-yr; BCG immediate); startups seed/AB/growth 0 (safe harbor must vest immediately); bootstrapped 0–2; PE 3 | – | A6 rows |
| benefitsValue: employer health premium share, single coverage (years 1–8) | corporate $8,500; consulting $8,500; growth/PE $8,000; seed/AB $7,500; bootstrapped $7,000 | $/yr, 2026$ | KFF 2025 single premium $9,620 (2026$); employer ≈ 84%; small firms often pay 100% of single but on thinner plans. Differences ≈ $1–1.5K; **near a wash, could be dropped** |
| benefitsValue: employer health premium share, family coverage (years 9+) | corporate/consulting $21,400; growth/PE $20,500; seed/AB $19,500; bootstrapped $18,700 | $/yr, 2026$ | KFF 2025 employer share by firm size (36% vs 23% worker share); plan-richness gap not counted. Difference ≈ $2.5–3K/yr, the only health number worth modeling |
| ESPP add-on (optional) | +0.008 × base for corporate technical only | 0–0.015 | 15% discount + lookback, 45% participation, offered at roughly half of big tech (MSFT/Apple yes; Google/Meta/Amazon no) |
| realReturn | **0.045** | 0.03–0.06 | US equities 6.8% real 1928–2025 and ~8.3% 1975–2025 (Damodaran); world 5.2% (yearbook); VCMM 10-yr ≈ 2.5–3.5% real for US equities. 80/20 blended over 35 years with mean reversion ≈ 4.5%. Keep the existing 0.045; show 3% and 6% as sensitivities |
| savingsRate (of gross pay, pre-tax, incl. employee 401k deferral) by income | < $80K: 0.10; $80–150K: 0.14; $150–250K: 0.18; > $250K: 0.22 | ±0.04 | Vanguard avg deferral 7.7% + taxable saving; Dynan et al. SCF medians Q4 14%, Q5 27%, top 5% 37% (incl. capital gains) and PSID active+pension Q4 18%, Q5 23% |
| savingsRate by track (if income-based is too fiddly) | corporate 0.14; consulting 0.16 (higher pay, less time to spend it); startup 0.11 (lower cash, higher rent-city exposure); PE/bootstrapped 0.12 | ±0.04 | same, mapped through each track's typical cash pay. The existing single 0.12 is acceptable but flat; income-graded is closer to the evidence |
| windfallSavingsRate | **0.70** of the after-tax windfall (≈ 0.45 of gross if taxed at 35%) | 0.5–0.85 | Dynan et al. top-5% saving 37% of *regular* income plus high-earner MPC out of transitory income ≈ 0.2–0.3; existing 0.80 is on the high side unless it is already net of tax |
| tax note | Model everything pre-tax; report spendable wealth = 0.75 × pre-tax balance (0.78 lower-income paths, 0.70 windfall-heavy startup paths). Combined marginal ≈ 35–38% for $100–250K single filers (federal 22–32% + ~5% state + FICA); equity windfalls taxed at LTCG ≈ 20–24% + state, so a startup exit keeps ~5–10 more points than the same dollars as salary | – | C3 |
| SCF year-30 sanity band (single earner, financial wealth, 2026$) | corporate/consulting **median $0.5–1.1M, mean $0.9–2.0M**; year-15 (age ~37) median $0.15–0.3M | – | SCF 2022 Table 2: age 45–54 median $281K / mean $1.11M; income 80–89.9 median $850K / mean $1.44M; top decile median $2.91M; college-degree median $529K (all ages); all household-level incl. home equity, so the sim should sit at 50–70% of these |

Open items the research could not close: no by-stage startup 401(k) survey exists (Carta and
Kruze do not publish one); McKinsey's current PSRP percentage (7.5% vs 12%) and its vesting are
employee-reported; KPMG's 6–8% automatic contribution is from memory; the UBS yearbook and 2026 IRS
bracket figures are from memory and should be spot-checked if they end up load-bearing.
