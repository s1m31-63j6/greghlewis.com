# Sourced inputs for the career-paths Monte Carlo

Compiled 2026-09-06. Scope: a fresh US bachelor's graduate, 35-year horizon, three first jobs
(corporate / consulting / startup), two personas (technical = CS/engineering; non-technical =
business/analytics/finance). All dollars are **2026 real dollars** unless a row says otherwise.

Tags: **M** = measured (a survey, payroll, or administrative number reported by the source);
**E** = estimated (derived, blended, or my own judgment where no source exists). Every row carries a
bias note.

## CPI conversion used

| item | value | source | url | year | tag | note |
|---|---|---|---|---|---|---|
| CPI-U annual avg 2024 | 314.2 | BLS via MIT IR | https://ir.mit.edu/projects/cpi-u | 2024 | M | official |
| CPI-U annual avg 2025 | 322.6 | BLS via MIT IR | https://ir.mit.edu/projects/cpi-u | 2025 | M | official |
| CPI-U July 2025 / June 2026 / July 2026 | 323.048 / 333.952 / 333.918 (12-mo +3.4%) | BLS CPI Table 1 | https://www.bls.gov/news.release/cpi.t01.htm | 2026 | M | official |
| 2026 anchor used here | 333 (≈ Jan–Jul 2026 mean) | derived | – | 2026 | E | the year isn't over; error < 0.5% |

Factors applied: **2022 → ×1.138, 2023 → ×1.093, 2024 → ×1.060, 2025 → ×1.032, early-2026 → ×1.00.**
Consulting/levels figures quoted as "2026" by trackers are early-2026 offer data and are left as-is.

---

## A. Starting pay (year-1 total cash, new grad)

### A1. Corporate technical

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Big-tech-skewed new-grad SWE median total comp | $155K nominal → **$160K** | $/yr, incl. equity+bonus | Levels.fyi 2025 End-of-Year Pay Report (245K data points, 5K companies) | https://www.levels.fyi/2025/ | 2025 | M | self-reported, skews to high-paying firms and people who bother to submit; "total comp" includes annualized RSUs, which are not cash |
| Same, "entry-level" YoY | +1.6% (2024 $152K → 2025 $155K) | – | Levels.fyi | https://www.levels.fyi/2025/ | 2025 | M | as above |
| NACE software-engineering major, starting base | $82,536 nominal → **$85.2K** | $/yr base only | NACE Winter 2025 Salary Survey (employer projections) | https://www.naceweb.org/job-market/compensation/class-of-2025-salary-projections-mixed | 2025 | M | employer-reported *projections* for hires; base only, no signing/bonus; large employers over-represented |
| NACE computer engineering | $82,565 → $85.2K | $/yr base | NACE | same | 2025 | M | as above |
| NACE all engineering | $78,731 → $81.2K | $/yr base | NACE | same | 2025 | M | as above |
| NACE computer science (all CS majors) | ~+1.7% YoY; level ≈ $76–78K nominal → **~$80K** | $/yr base | NACE (level inferred from 2024 base + growth) | same | 2025 | E | NACE only reported the growth rate in the summary I could reach |
| Non-big-tech engineering year-1 cash incl. ~5% signing/bonus | **$88K** | $/yr cash | derived from NACE | – | 2026 | E | adds a typical $3–5K signing bonus to base |
| Share of CS grads landing SWE roles at the 12 largest tech firms | **13%** (class of 2025), down from ~25% (class of 2022) | share | Entrepreneur/Yahoo Finance citing a LinkedIn-profile analysis | https://www.entrepreneur.com/business-news/computer-science-grads-have-a-new-dream-job-and-its-not-working-for-meta-apple-or-google | 2025 | M | LinkedIn-profile based; undercounts people who don't update profiles; "12 biggest" excludes well-paid unicorns and fintech |
| Elite-school (MIT/Stanford/CMU/Berkeley) share at major tech | 11–12% (2025) vs 25% (2022) | share | same | same | 2025 | M | as above |

**Suggested blend.** Levels.fyi's "entry level" median is broader than the 12 giants (it includes
well-paid unicorns, HFT, fintech), so weight it above the 13% figure: **25% at $160K, 75% at $88K →
blended $106K**, but simulate it as the *mixture* rather than the mean, because the distribution is
bimodal. Note ~$20–30K of the $160K is RSUs, not cash; if the model is cash-only use ~$135K for the
big-tech component (blend → $100K).

### A2. Corporate non-technical

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| NACE business majors, starting base | $65,276 nominal → **$67.4K** | $/yr base | NACE Winter 2025 | https://www.naceweb.org/job-market/compensation/class-of-2025-salary-projections-mixed | 2025 | M | employer projections; base only |
| NACE overall class-of-2025 average | $76,251 → $78.7K | $/yr base | NACE | same | 2025 | M | all majors, engineering-heavy respondents |
| F500 finance LDP / rotational, starting | $60–85K (guide); Thermo Fisher FLDP $82K posted; J&J entry FA median TC $85K | $/yr | Corporate Finance Academy; Thermo Fisher careers; Levels.fyi | https://corporatefinanceacademy.com/finance-leadership-development-program-the-ultimate-guide/ ; https://jobs.thermofisher.com/global/en/fldp ; https://www.levels.fyi/companies/johnson-and-johnson/salaries/financial-analyst | 2025–26 | M/E | posted ranges and self-reports; ZipRecruiter's $96K "FLDP average" mixes years 1–3 and is not new-grad |
| GE FLDP total pay (Glassdoor estimate) | ~$107K base / $137K total | $/yr | Glassdoor | https://www.glassdoor.com/Salary/GE-Finance-Leadership-Development-Program-Salaries-E277_D_KO3,41.htm | 2025 | E | Glassdoor "estimated" figure; mixes program years; high outlier |
| Suggested year-1 cash, F500 rotational (analytics/finance) | **$75K** | $/yr cash | derived | – | 2026 | E | ~$70K base + ~$5K signing; sits between NACE business base and posted LDP ranges |

### A3. Consulting (undergrad level)

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| MBB business analyst base | **$112K** (McKinsey, BCG, Bain all ~$112K; frozen since 2023) | $/yr base | Management Consulted 2026 report; Road to Offer | https://managementconsulted.com/consultant-salary/ ; https://www.roadtooffer.com/blog/mckinsey-salary | 2026 | M | offer-holder self-reports; MC page returned 403 to my fetcher, figures taken via the two secondary pages that cite it |
| MBB performance bonus | up to $15–22.5K (BCG/Bain top out at $22.5K) | $/yr | PrepLounge / Management Consulted | https://www.preplounge.com/en/blog/consulting/salary/usa | 2026 | M | "up to" — median realized bonus is lower, ~$10–15K |
| MBB signing bonus | ~$5K | one-time | Road to Offer | https://www.roadtooffer.com/blog/mckinsey-salary | 2026 | M | – |
| MBB year-1 total cash | **$132–137K** | $/yr | Road to Offer (Glassdoor 34,871 points + Levels.fyi + MC) | same | 2026 | M | self-reported |
| Deloitte analyst base | $75–95K (strategycase), $90–100K (PrepLounge) | $/yr base | multiple | https://strategycase.com/deloitte-consulting-salary-career-guide/ ; https://www.preplounge.com/en/blog/consulting/salary/usa | 2026 | M | practice-dependent; Monitor Deloitte pays 10–20% above core |
| Deloitte signing / perf bonus | $10–15K signing; $5–15K perf | $ | same | same | 2026 | M | – |
| Deloitte analyst year-1 total | **$95–105K** | $/yr | strategycase / hackingthecaseinterview | https://www.hackingthecaseinterview.com/pages/deloitte-consulting-salary | 2026 | M | self-reported |
| Accenture Strategy signing bonus (undergrad) | $12.5K; base ~$85–95K | $ | PrepLounge | https://www.preplounge.com/en/blog/consulting/salary/usa | 2026 | M | – |
| Suggested blend | **30% MBB @ $135K + 70% Big-4/tier-2 @ $100K → $110K** | $/yr cash | derived | – | 2026 | E | MBB hires far fewer undergrads than Big 4 + Accenture; if the persona is explicitly "MBB", use $135K |

### A4. Startup

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Mid-level engineer cash by stage | seed ~$110K; Series B ~$145K; Series C/D ~$175K; public big tech ~$205K | $/yr | Cadence blog compiling Carta/Pave/Levels | https://cadence.withremote.ai/blog/software-engineer-salary-company-stage | 2025–26 | E | secondary compilation; mid-level not new-grad; implies seed ≈ 0.54×, Series B ≈ 0.71×, growth ≈ 0.85× big tech |
| New-grad base: growth-stage startups vs FAANG | $90–120K vs $130–175K | $/yr base | CV-BY-JD salary guide (cites Levels.fyi) | https://www.cv-by-jd.com/salary-guide/software-engineer | 2026 | E | secondary; ratio ≈ 0.70 |
| Average salary of new engineering hires on Carta | $189K nominal → $195K | $/yr | Carta (payroll/cap-table data) | https://carta.com/data/q2-compensation-ai-engineers/ | 2025 | M | all levels, Bay-Area-heavy, funded companies only (survivorship); Carta H2-2025 page 403'd |
| Seed-stage early-employee pay | $132–149K | $/yr | Kruze via TechCrunch | https://techcrunch.com/2024/12/25/132k-149k-heres-what-seed-stage-founders-pay-early-employees-based-on-data | 2024 → ×1.06 | M | payroll data, funded startups only; early employees are usually experienced, not new grads |
| Startup IC median salary growth | +6.4% over 2 yrs; initial equity grants +11% | – | Carta | https://carta.com/data/startup-compensation-h2-2025/ | 2025 | M | – |

**Suggested discount (cash only).** Technical persona: seed **0.65×** big tech / **0.80×** blended
corporate; Series A–B **0.75× / 0.90×**; growth **0.90× / 1.05×**. In dollars: seed $80K, A–B $95K,
growth $115K; mixture-weighted (20/50/30) **≈ $98K**, i.e. **~8% below blended corporate technical
($106K)** and ~40% below big tech. Non-technical persona (BizOps/ops/analyst): **$68K** (≈ 0.90×
corporate $75K). Equity is *not* in these numbers — see section D2 note on how to treat it.

---

## B. Career pay curves (real multipliers of year-1 pay)

### B1. General bachelor's age-earnings profile

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| College wage premium over HS by age | 27% at age 25 → 60% at age 55 | ratio | Deming, "Why Do Wages Grow Faster for Educated Workers?" NBER WP 31373 | https://www.nber.org/papers/w31373 | 2023 | M | panel data (NLSY-type) followed to age 60; cohort effects embedded |
| Share of life-cycle wage growth that is within-job | ~90% | share | same | same | 2023 | M | argues employer-switching is not the main engine of growth |
| Bachelor's median annual earnings (all ages, FTYR) | $86,970 nominal → $95K | $/yr | Census (2023) via BLS Career Outlook | https://www.bls.gov/careeroutlook/2025/data-on-display/education-pays.htm | 2023 | M | all bachelor's holders 25+, cross-section |
| Bachelor's median weekly earnings | $1,543/wk ≈ $80K nominal → $85K | $/yr | BLS CPS 2024 | same | 2024 | M | FT wage & salary workers 25+ |
| Bachelor's 25–34 FTYR median (NCES/Census) | ≈ $66K (2022) → $75K | $/yr | NCES Condition of Education, indicator CBA | https://nces.ed.gov/programs/coe/indicator/cba/annual-earnings | 2022 | M | level read from the indicator's 2022 series; 25–34 vs all-ages ratio ≈ 0.78 |
| HS-graduate lifecycle wage growth, age 25 → 50 (US) | ~+50–60% | ratio | Lagakos, Moll, Porzio, Qian, Schoellman (JPE 2018) — cited from memory | – | 2018 | E | needed to back out the college curve from Deming's premium ratio |

**Derived curve (E).** College real growth ≈ (1.60/1.27) × HS growth ≈ 1.26 × 1.55 ≈ **~1.95× from age
25 to 55**. Anchoring year 1 at age 22–23 (where pay is a bit below age-25 pay):

| year | 1 | 5 | 10 | 15 | 20 | 25 | 30 | 35 |
|---|---|---|---|---|---|---|---|---|
| general bachelor's multiplier (E) | 1.00 | 1.35 | 1.65 | 1.85 | 2.00 | 2.05 | 2.05 | 2.00 |

This is a cross-sectional median (all bachelor's, all fields); it is not conditioned on staying
employed and it flattens the top. Use it as the "generic corporate non-technical" spine.

### B2. Corporate technical ladder

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Levels.fyi US SWE median total comp by level, 2025 | Entry $155K; Mid $226K; Senior $312K; Staff $457K; Principal $551K (2024: 152/222/300/425/590) | $/yr TC | Levels.fyi 2025 report | https://www.levels.fyi/2025/ | 2025 | M | self-reported, big-tech-skewed; multipliers vs entry: **1.46 / 2.01 / 2.95 / 3.55** |
| Google L3 / L5 / L6 median TC | $203K / $428K / ~$870K | $/yr TC | Levels.fyi company page & summaries | https://www.levels.fyi/companies/google/salaries/software-engineer | 2026 | M | one firm, top of market |
| Typical YOE per level (community norm) | L3 0–2; L4 2–5; L5 5–9; L6 9–12+; L7 12+ | years | Design Gurus / ResumeAdapter summaries of Levels.fyi | https://www.designgurus.io/blog/google-software-engineer-levels ; https://www.resumeadapter.com/companies/google/levels | 2026 | E | folk ranges; L5 "senior" is the terminal level for most; L6+ is impact-gated, not tenure-gated |
| Share of SWEs who ever reach Staff (L6) | ~10–15% | share | – | – | – | E | no published figure; inferred from level pyramids on Levels.fyi and Blind lore |
| BLS software developers median wage (non-big-tech anchor) | $133K nominal (May 2024) → $141K; 90th pct ~$210K → $223K | $/yr wages | BLS OES 15-1252 (cited from memory of the May 2024 release) | https://www.bls.gov/oes/ | 2024 | M | all developers all ages; vs $88K new grad → 1.6× at the median |

**Suggested curves (E), multiplier of year-1 cash:**

| year | 1 | 5 | 10 | 15 | 20 | 25 | 30 | 35 |
|---|---|---|---|---|---|---|---|---|
| big-tech track (median survivor: senior by yr 8, ~12% reach staff) | 1.00 | 1.50 | 2.00 | 2.20 | 2.35 | 2.35 | 2.25 | 2.15 |
| non-big-tech engineering | 1.00 | 1.35 | 1.60 | 1.80 | 1.90 | 1.95 | 1.95 | 1.90 |

The big-tech curve flattens after year 15 because most engineers terminal at senior; the small
staff/principal branch should be a separate Bernoulli draw (p≈0.12 at year 9–12) that lifts the
multiplier to ~3.0–3.5. Late-career decline reflects age effects visible in every cross-section
(and is where layoffs bite hardest).

### B3. Consulting ladder

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| McKinsey BA (yrs 0–2) | $112K base; $132–137K total | $/yr | Road to Offer | https://www.roadtooffer.com/blog/mckinsey-salary | 2026 | M | Glassdoor/Levels/MC self-reports |
| McKinsey Associate (MBA or direct-promote, yrs 3–5) | $192K base; ~$262–267K total incl. $30K signing (MBA entrants); direct promotes ~$220–250K | $/yr | same | same | 2026 | M/E | direct-promote figure is my haircut of the MBA package (no signing bonus, lower first-year bonus) |
| Engagement Manager (yrs 5–8) | $220–250K base; $280–330K total | $/yr | same | same | 2026 | M | – |
| Associate Partner (yrs 8–11) | $250–300K base; $330–420K total | $/yr | same | same | 2026 | M | – |
| Partner (yr 11+) | $400–650K base; $700K–1.5M total | $/yr | same | same | 2026 | M | wide; profit share |
| Senior Partner | $1.5–5M+ | $/yr | same | same | 2026 | M | tail |
| MBA-level consulting median (P&Q, class of 2025) | base ~$190K, sign ~$30K | $/yr | Poets&Quants | https://poetsandquants.com/2026/01/26/consulting-pay-what-mbas-earned-in-2025/ | 2025 | M | school-reported employment data |
| Deloitte Analyst → Consultant → Sr Consultant → Manager → Sr Manager → MD/Partner | $95–105K → ~$125K → $130–190K → $240–290K → $330–400K → $450K–1M+ | $/yr total | strategycase, hackingthecaseinterview | https://strategycase.com/deloitte-consulting-salary-career-guide/ ; https://www.hackingthecaseinterview.com/pages/deloitte-consulting-salary | 2026 | M | self-reports; Monitor Deloitte +10–20% |
| Deloitte years per rung | promos every 1–2 yrs early, 2–4 later; analyst → partner 12–15 yrs | years | hackingthecaseinterview / Road to Offer | https://www.hackingthecaseinterview.com/pages/consulting-promotion-timeline | 2026 | E | folk timeline |

**Suggested multipliers of year-1 cash, conditional on surviving on the ladder (E):**

| year | 1 | 5 | 10 | 15 | 20 | 25 | 30 | 35 |
|---|---|---|---|---|---|---|---|---|
| MBB (base $135K) | 1.00 | 1.75 (associate/EM) | 2.75 (AP) | 6.0 (partner, low end) | 7.5 | 8.5 | 9.0 | 9.0 |
| Big 4 (base $100K) | 1.00 | 1.55 (sr consultant) | 2.50 (manager) | 3.60 (sr manager) | 5.5 (MD/partner) | 6.5 | 7.0 | 7.0 |

These are *survivor* curves; almost nobody rides them to year 15 (see C1). The realized consulting
persona is mostly "exit at year 2–6 onto a corporate curve with a premium" (B4).

### B4. Consulting exit premium

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Peer-reviewed estimate of an ex-consultant wage premium vs never-consulted peers | **none found** in 3 targeted searches | – | – | – | – | – | trackers only report exit *destinations* and anecdotal exit salaries |
| Exit destinations (MBB) | corporate strategy, PE/VC, tech, startups; alumni over-represented in exec ranks | – | Poets&Quants "Consulting exit ramps" | https://poetsandquants.com/2025/12/09/consulting-exit-ramps-where-mckinsey-bain-bcg-professionals-are-headed/ | 2025 | M | destination shares, not pay |
| Typical exit pay, 3–5 yrs out of MBB → corporate strategy | ~$150–250K total | $/yr | Career in Consulting guide | https://careerinconsulting.com/consulting-exit-opportunities/ | 2025 | E | anecdotal ranges; selection into good exits |
| Mechanism support | educated workers' faster growth is "primarily explained by occupational sorting" into complex jobs | – | Deming NBER 31373 | https://www.nber.org/papers/w31373 | 2023 | M | consistent with consulting acting as an accelerated sorting device, but not a direct test |

**ESTIMATE.** Model the exit as: new pay = max(corporate-persona curve at same YOE × **1.15**,
0.90 × last consulting cash), with the 1.15 premium decaying linearly to **1.05 by 10 years
post-exit**. Rationale: exit ranges above sit 15–30% over the F500 curve at the same age, but that is
selected on people who *got* the good exit; Deming's within-job-growth finding argues the premium
should fade rather than compound. Range to test in sensitivity: 1.05–1.30 initial.

---

## C. Attrition, promotion, and involuntary-separation hazards (annual)

### C1. Consulting

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| MBB total turnover | 20–30%/yr | share | CaseCoach; LinkedIn News | https://casecoach.com/b/up-or-out-policy-mckinsey-bcg-or-bain/ ; https://www.linkedin.com/news/story/consultants-face-higher-attrition-5991212/ | 2024–26 | E | prep-site synthesis of firm lore; firms don't publish |
| Counselled-out ("up or out") | ~5% of a class every 6 months after year 1 → **~10%/yr involuntary** | share | Case Interview Hub / hackingthecaseinterview | https://www.caseinterviewhub.com/post/the-up-or-out-principle-at-mckinsey-bcg-bain ; https://www.hackingthecaseinterview.com/pages/bcg-up-or-out | 2026 | E | lore; likely overstates in strong years, understates in 2023–24 |
| Promotion-gate pass rate | 70–75% of those up for promotion clear each gate; 5–6 gates to partner | share | Case Interview Hub | same | 2026 | E | lore |
| Share of entry-level consultants who make partner | **5–10%** | share | hackingthecaseinterview ("internal data") | https://www.hackingthecaseinterview.com/pages/bcg-up-or-out | 2026 | E | 0.72^5 ≈ 19% of *those who stay and are put up* — the 5–10% figure also folds in voluntary exits |
| Average tenure at a top firm | 2.7 years | years | LinkedIn data via CaseCoach | https://casecoach.com/b/why-people-leave-consulting-after-two-to-four-years/ | 2024 | M | LinkedIn profiles; short spells over-sampled |
| Accenture voluntary attrition (firm-published) | **FY2025 14%** (FY2024 13%); quarterly annualized 12/13/16/15% | share | Accenture earnings release / 8-K | https://newsroom.accenture.com/content/4q-full-fy25-earnings/accenture-reports-fourth-quarter-and-full-year-fiscal-2025-results.pdf | 2025 | M | global, all staff (mostly offshore delivery); excludes involuntary; FY2022 peak was ~18–20% (memory, E) |
| Big 4 US voluntary turnover | "historically/unusually low" 2024–25; PwC 2.5% (2024) and 2% (2025) layoffs, KPMG 4% of audit (2024) | share | CFO Brew; Big4AccountingFirms; NCS | https://www.cfobrew.com/stories/2025/11/12/cost-cutting-measures-hit-big-four-staff ; https://big4accountingfirms.com/the-blog/big-4-accounting-firm-layoffs-2025/ | 2024–25 | M | layoff shares are firm-announced; no published voluntary % |
| Big 4 total annual attrition (E) | **15–20%** | share | – | – | – | E | pre-2023 lore was 20–25%; 2024–25 sits below that per the "unusually low" reporting |

**Timing of gates (E):** BA → associate/consultant at yr 2–3 (pass ~75%; ~25% of the class leaves
before or at this gate); → EM/manager at yr 5–6 (pass ~70%); → AP/sr manager at yr 8–9 (~65%);
→ partner at yr 11–13 (~50%). Combined with ~12–15%/yr voluntary exits, an entering class of 100
has roughly 55 left at yr 3, 25 at yr 6, 12 at yr 9, and 5–8 at partner — matching the 5–10%.

### C2. Corporate layoff/discharge hazards (JOLTS)

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Layoffs & discharges rate, annual avg, **total private** | 1.1 / 1.1 / 1.2 / 1.2 / 1.2 % per month (2021–25) | %/month of employment | BLS JOLTS Table 24 | https://www.bls.gov/news.release/jolts.t24.htm | 2025 | M | all workers, all tenures, all reasons incl. for-cause; annualized ≈ 14% |
| Professional & business services | 1.7 / 1.6 / 1.7 / 1.8 / **2.0** % per month | %/month | same | same | 2025 | M | includes temp-help agencies, which dominate this rate; annualized 24% — not a professional's hazard |
| Information | 1.0 / 1.2 / 1.1 / 1.1 / **1.3** % per month | %/month | same | same | 2025 | M | closest sector proxy for tech; annualized 15.6% |
| Finance & insurance | 0.4 / 0.5 / 0.4 / 0.5 / **0.6** % per month | %/month | same | same | 2025 | M | annualized 7% |
| Long-tenured (3+ yr) displaced workers, 2023–25 | 7.4M total displaced (all tenures) | count | BLS Displaced Worker Survey Jan 2026 | https://www.bls.gov/news.release/disp.htm | 2026 | M | biennial CPS supplement; recall-based |

**ESTIMATE for a salaried professional:** JOLTS rates are pulled up by hourly, temp, and for-cause
churn. Tenured professionals run at roughly a third of the sector rate. Suggested annual involuntary
separation probability: **tech/information 5%** (spike to 8–9% in a 2023-type year), **F500
non-tech 4%**, **finance 3%**, **startup 12%** (company failure + layoff; see C3 note), rising by
+1–2 pts after age 50.

### C3. Tech-specific layoffs 2022–2026 (sanity check)

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| layoffs.fyi tech layoffs | 2022 164,969; 2023 262,682; 2024 152,922; 2025 122,549 (703K cumulative) | people | layoffs.fyi via ValueAdd VC / TechCrunch | https://layoffs.fyi/ ; https://valueaddvc.com/blog/total-tech-layoffs-2022-2025-cumulative-numbers-and-what-drove-each-wave | 2025 | M | global, company-announced, tech-company-defined (not tech-occupation); undercounts quiet cuts |
| US tech-occupation workforce | ~5.9M (2024), ~6.1M projected 2025; net tech employment 9.6M | people | CompTIA State of the Tech Workforce 2025 | https://www.comptia.org/en-us/resources/research/state-of-the-tech-workforce-2025/ | 2025 | M | occupation-based |
| Implied annual layoff share of US tech occupations | 2.8% / 4.5% / 2.6% / 2.1% (2022–25) | share | derived | – | – | E | numerator is global so this is an upper bound on the US share; but it excludes non-"tech company" layoffs of engineers |

Consistent with C2's 5% base hazard for tech (JOLTS Information 15%/yr is clearly too high for
professionals; layoffs.fyi's 2–4.5% is a floor).

### C4. Unemployment duration and re-employment wage change

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Median unemployment duration, management/business/financial occupations | **11.4 wks (2025)**; 12.1 (2024); 10.3 (2023); mean 24.1 wks; 25.4% long-term (27+ wks) | weeks | BLS CPS Table 32 via Career Agents summary | https://www.bls.gov/cps/cpsaat32.pdf ; https://careeragents.org/blog/average-job-search-duration/ | 2025 | M | all unemployed in the occupation, not only job losers; right-skewed |
| Long-tenured displaced workers re-employed by survey date | 66.1% (Jan 2026), 65.7% (Jan 2024) | share | BLS DWS | https://www.bls.gov/news.release/disp.htm | 2026 | M | survey date is 1–36 months after loss |
| Management/professional re-employment share | 65.3% | share | same | same | 2026 | M | – |
| Re-employed FT workers earning ≥ prior job | **49% (2026)** vs 62% (2024) | share | same | same | 2026 | M | recall-based earnings; big 2026 deterioration |
| Re-employed FT workers earning ≥20% less | ~19% | share | same | same | 2026 | M | – |
| Displaced workers whose earnings rose ≥20% (some sectors) | >40% | share | SC DEW summary of DWS 2024 | https://dew.sc.gov/labor-market-information-blog/2024-10/us-long-tenured-worker-displacement-2021-2023 | 2024 | M | shows a fat *upper* tail too |

**Suggested draw (E):** spell length ~ lognormal(median 12 weeks, σ≈0.9) capped at 78 weeks (gives
mean ≈ 22 weeks, ~20% over 27 weeks); re-employment wage ratio ~ normal(mean 0.97, sd 0.20),
truncated to [0.5, 1.5] — that reproduces ~50% at ≥1.0 and ~18% at ≤0.8. Age 50+: shift mean to
0.90 and median spell to 18 weeks.

### C5. Job-switching rates by age

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Median tenure with current employer, Jan 2024 | 25–34: **2.7 yr**; 35–44: 4.6; 45–54: 7.0; 55–64: 9.6; private sector 3.5; mgmt/professional 4.8; management occupations 5.7; architecture & engineering 4.9 | years | BLS Employee Tenure 2024 | https://www.bls.gov/news.release/archives/tenure_09262024.htm | 2024 | M | cross-sectional incomplete spells, not completed-spell lengths; 20-year low for the overall median |
| Share of MBB consultants leaving after 2–4 years | "most"; avg tenure 2.7 yr | – | CaseCoach | https://casecoach.com/b/why-people-leave-consulting-after-two-to-four-years/ | 2024 | E | – |

**ESTIMATE (voluntary employer-change hazard, professionals):** ages 22–29 **15%/yr**, 30–39
**10%/yr**, 40–49 **6%/yr**, 50+ **4%/yr**. Implied: 39% change employer within 3 years, 56% within
5, ~80% within 10. Voluntary switches carry a pay bump ~ normal(+8%, sd 10%) in the first 10 years,
~ normal(+4%, sd 10%) after (Deming's "90% within job" suggests keeping these modest).

---

## D. Graduate school and founding

### D1. MBA

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| Share of MBB consultants who leave for business school | ~5% of departures | share | hackingthecaseinterview | https://www.hackingthecaseinterview.com/pages/mbb-exit-opportunities | 2026 | E | lore; much lower than the pre-2015 norm (firms now promote BAs directly and MBA sponsorship has shrunk) |
| Share of top-MBA class that is ex-consulting | MIT Sloan 35%, Kellogg 32%, Wharton 31% (class of 2027); >20% at Booth/Haas/LBS | share | Clear Admit | https://www.clearadmit.com/2025/11/consulting-placement-trends-at-leading-mba-programs/ | 2025 | M | school-published class profiles |
| Two-year tuition, 2025–26 | HBS $157.4K; Stanford GSB $171.5K; Wharton $184.6K; 21 of top 25 charge ≥$100K/yr | $ | GMAC; Poets&Quants | https://www.gmac.com/resources/learners/how-to-apply/scholarships-financing/mba-tuition-fees-worlds-best-business-schools ; https://poetsandquants.com/2025/08/27/the-mba-price-tag-21-of-the-top-25-u-s-b-schools-now-charge-100k-a-year-or-more/ | 2025 | M | sticker; median scholarship at M7 ~$30–60K total (E) |
| Post-MBA median base, class of 2025 | HBS $184.5K; Stanford $185K; Wharton $185K; signing $30K (58% receive at HBS); HBS median total $232.8K; Stanford median expected bonus $43K | $/yr | Poets&Quants; Clear Admit; school reports | https://poetsandquants.com/2025/12/02/harvard-business-school-class-of-2025-jobs-report-offers-rebound-pay-soars/ ; https://www.clearadmit.com/2025/12/stanford-gsb-employment-report-mba-class-of-2025/ | 2025 | M | school-reported, only those seeking and reporting; ×1.032 → ~$190K base, ~$240K total at HBS |
| Top-100 range of MBA median base | roughly $90K–$185K | $/yr | Poets&Quants | https://poetsandquants.com/2026/05/31/high-low-mba-salaries-bonuses-at-the-top-100-u-s-b-schools/ | 2026 | M | – |

**Suggested MBA parameters (E):** probability of enrolling within 5 years: consulting 15% (MBB 25%,
Big 4 10%), corporate 5%, startup 4%. Cost: **$175K tuition+fees + $50K living** (net of a ~$40K
average scholarship) + two years of foregone pay at the persona's current level. Post-MBA year-1
total cash: **$225K** if top-15 (p=0.6 conditional on going), **$140K** otherwise; from there follow
the MBB or big-tech curve at the "associate / L4" rung. Uplift vs the corporate curve at the same age
is ~+50–70% in year 1, fading to ~+25% by year 10 (no direct study; anchored on the gap between
pre-MBA pay for a 5-YOE corporate hire (~$110–130K) and the $225–240K post-MBA package).

### D2. Founding

| item | value | unit | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| US adults who have ever started a business | 55% | share | LegalZoom entrepreneur stats | https://www.legalzoom.com/articles/entrepreneur-statistics | 2025 | E | survey-of-surveys; "business" includes side gigs |
| GEM USA TEA, ages 18–24 | 24% currently entrepreneurs; 21% intend within 3 yrs; 25–34/35–44 historically highest | share | GEM USA 2023/24 | https://www.gemconsortium.org/news/younger-generations-continue-starting-businesses-at-highest-rates,-according-to-latest-gem-usa-report | 2024 | M | TEA counts any nascent/new business incl. sole proprietorships |
| Mean age of a high-growth founder | 45 | years | Azoulay et al. via HBR | https://hbr.org/2018/07/research-the-average-age-of-a-successful-startup-founder-is-45 | 2018 | M | Census LBD + IRS; "high-growth" is top 0.1% |
| Seed-stage CEO average salary | $132K (2024) → $147K (2025) → **$153K (2026)** | $/yr | Kruze Consulting (anonymized payroll, 450+ startups) | https://kruzeconsulting.com/blog/startup-ceo-salary-report/ | 2026 | M | funded startups only (survivorship); average not median; AI-heavy sample |
| Founders taking salary cuts (Pilot) | "more founders taking cuts" (2025) | – | Pilot via SaaStr | https://www.saastr.com/kruze-the-average-startup-ceo-salary-up-to-161000 | 2025 | E | not fetched directly |

**Suggested founding parameters (E):** probability a professional founds a *venture-scale* company by
year 15: technical 5%, non-technical 2.5%; startup-first-job persona 2× those. Founder cash: pre-seed
years 1–2 **$40K**, seed **$130K** (median haircut of Kruze's $153K average), Series A+ **$180K**.
Outcome branch at year 4: 60% shut down (return to corporate curve at same YOE, no premium), 30%
modest exit/lifestyle (one-time $0–300K), 10% real exit (lognormal, median $1.5M). Employee equity at
a startup first job: expected value ≈ 10–15% of cash per year, realized as a one-time lognormal draw
with p(zero) ≈ 0.7 — I'd show it separately rather than fold it into "pay".

---

## E. Personal-demand indicators (hours, travel)

| track / rung | hours/wk | travel | source | url | year | tag | note |
|---|---|---|---|---|---|---|---|
| MBB analyst–EM | 55–65 typical; 50–60 (hackingthecase); 60–70 (Glassdoor via MyConsultingOffer); 58–65 + ~10 hrs travel (PrepLounge) | historically Mon–Thu on site; post-COVID ~30–50% of weeks (E) | multiple prep sites | https://www.hackingthecaseinterview.com/pages/consulting-hours-per-week ; https://www.myconsultingoffer.org/cover-letter/mbb-work-life-balance/ ; https://www.preplounge.com/consulting-forum/working-hours-at-mbb-and-other-firms-23858 | 2025–26 | E | self-report from a population that likes to talk about hours |
| MBB partner | 55–60 + heavy travel (client dev) | high | – | – | – | E | – |
| Big 4 / tier-2 consulting | 45–55; spikes to 60+ at deadlines | moderate; project-dependent | WSO / strategycase | https://strategycase.com/how-much-consultants-work/ | 2025 | E | – |
| Big-tech SWE | avg ~41; 29% work 50+; big tech realistically **45–50** | low | 4dayweek.io; devsdata | https://4dayweek.io/work-life-balance/software-developers-work-week ; https://devsdata.com/how-many-hours-do-software-engineers-work-life-balance-across-regions/ | 2025 | E | survey aggregators; on-call and launch crunch not captured |
| Staff+ engineer | 50–55 | low–moderate | – | – | – | E | – |
| F500 non-tech analyst/manager | 42–47; director+ 48–52 | low | BLS avg full-time week ≈ 42 (memory) | – | – | E | – |
| Startup early-stage employee | 50–60 | low | – | – | – | E | founders' own accounts; no survey |
| Founder | 60–70 | moderate (fundraising) | – | – | – | E | – |
| MBA student | 45–55 incl. recruiting | some | – | – | – | E | – |

For a red–green bar: map 40 hrs → green, 50 → amber, 60+ → red, and add +5 "effective hours" per
travel-heavy week.

---

## Suggested parameter values (2026 real dollars)

**Starting cash (year 1).** Technical: corporate = mixture {25%: $160K big tech (cash-only ~$135K),
75%: $88K}; consulting = mixture {30%: $135K MBB, 70%: $100K Big 4}; startup = mixture {20%: $80K
seed, 50%: $95K A–B, 30%: $115K growth}. Non-technical: corporate $75K; consulting same mixture as
technical (consulting pays the same regardless of major); startup $68K. Reasoning: NACE gives the
floor for the mass of grads, Levels.fyi gives the top mode, and the 13%-at-big-tech figure says the
top mode is a minority; consulting numbers are the best-documented of all and I trust them within
±5%; startup discounts come from one secondary compilation and should get ±10 pts of sensitivity.

**Pay curves (multipliers of year-1, real).** Use B1's general spine for non-technical corporate
(1.00, 1.35, 1.65, 1.85, 2.00, 2.05, 2.05, 2.00 at years 1/5/10/15/20/25/30/35). Technical corporate:
big-tech branch (1.00, 1.50, 2.00, 2.20, 2.35, 2.35, 2.25, 2.15) with a 12% staff-branch draw at year
9–12 that scales the rest of the curve ×1.4; non-big-tech (1.00, 1.35, 1.60, 1.80, 1.90, 1.95, 1.95,
1.90). Startup employees: use the corporate curve for the persona (pay converges toward market as
companies mature) with annual noise sd 8% and the higher separation hazard. Consulting survivors: B3
tables, but only ~5–8% survive to partner; everyone else exits onto the corporate persona curve with
the B4 premium (1.15 → 1.05 over 10 years). Add idiosyncratic real wage noise ~ N(0, 6%) per year for
everyone, plus the layoff and switching shocks below, and cap real pay growth at 0 after age 58.

**Hazards (annual).** Consulting voluntary exit: 12% (yrs 1–2), 18% (yrs 3–6), 10% after; gates at
yrs 2–3 / 5–6 / 8–9 / 11–13 with pass rates 0.75 / 0.70 / 0.65 / 0.50, failures exit. Corporate
involuntary: tech 5% (8.5% in a stress year drawn with p=0.15), non-tech 4%, finance 3%, +1.5 pts
after age 50. Startup involuntary: 12%. Unemployment spell lognormal(median 12 wks, σ 0.9), cap 78
wks; re-employment wage ratio N(0.97, 0.20) truncated [0.5, 1.5]; after 50 use N(0.90, 0.22) and
median 18 wks. Voluntary switching 15/10/6/4% by decade of age, with N(+8%, 10%) bump before year 10
and N(+4%, 10%) after.

**Grad school / founding.** MBA within 5 years: consulting 15%, corporate 5%, startup 4%; cost $225K
+ 2 years foregone pay; post-MBA year-1 cash $225K (top-15, p=0.6) or $140K, then rejoin the relevant
ladder at the "associate / L4" rung. Founding by year 15: technical 5%, non-technical 2.5%,
startup-first ×2; founder cash $40K / $130K / $180K by stage; outcome at year 4: 60% fail, 30%
small, 10% real (median $1.5M lognormal).

**Hours (for the demand bar).** MBB 60, Big 4 50, big tech 47, other corporate 44, startup 55,
founder 65, MBA 50; consulting travel weeks +5 effective hours.

**Where I'm least sure, in order:** (1) the consulting exit premium — no study exists, the 1.15 is
judgment; (2) startup new-grad discounts — one secondary source; (3) the professional-specific layoff
hazard — JOLTS is far too coarse and I scaled it by a third; (4) MBA enrollment shares — the "5% of
MBB" figure is lore and contradicts the 31–35% ex-consultant share of top MBA classes (which is
consistent with either a small share of a huge consulting base or a large share of a small MBB
base); (5) the bachelor's curve — built from a premium ratio in one paper plus a remembered HS
profile, not read off a CPS table (a Census API key would let you pull ACS B15014 directly).
