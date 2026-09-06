"""Every number the simulation uses, with its source.

This is the single source of truth. Each leaf is a `Sourced` value: the number,
where it came from, whether it was measured or estimated, and a note on the
bias to keep in mind. The methodology page's source table is a flat walk over
this file, so an unsourced number cannot ship.

All money is 2026 real dollars. See research/sources_comp.md and
research/sources_startup.md for the extraction behind each value.

Run: uv run python params.py   -> params.json (here and in public/career-paths/)
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from publish import publish

HERE = Path(__file__).parent


@dataclass(frozen=True)
class S:
    value: Any
    source: str
    kind: str = "estimated"  # measured | estimated | derived
    url: str | None = None
    note: str | None = None


def sourced(value, source, kind="estimated", url=None, note=None) -> S:
    return S(value, source, kind, url, note)


# Sources cited by short name; the URL rides on the leaf. Research notes with
# the extraction and bias discussion: research/sources_comp.md (pay curves,
# attrition, MBA, founding) and research/sources_startup.md (everything about
# startup stages and equity). All dollars are 2026 real (CPI-U 333, July 2026).

NACE = "NACE Class of 2025 salary projections"
NACE_URL = "https://www.naceweb.org/job-market/compensation/class-of-2025-salary-projections-mixed"
LEVELS = "Levels.fyi End of Year Pay Report 2025"
LEVELS_URL = "https://www.levels.fyi/2025/"
DEMING = "Deming, NBER w31373 (college premium over the life cycle)"
DEMING_URL = "https://www.nber.org/papers/w31373"
MBB = "MBB and Big 4 salary compilations (roadtooffer, preplounge, strategycase)"
MBB_URL = "https://www.roadtooffer.com/blog/mckinsey-salary"
UPOROUT = "Consulting up-or-out timelines (hackingthecaseinterview, casecoach)"
UPOROUT_URL = "https://www.hackingthecaseinterview.com/pages/bcg-up-or-out"
JOLTS = "BLS JOLTS 2025 layoffs and discharges, scaled to tenured professionals"
JOLTS_URL = "https://www.bls.gov/jlt/"
DWS = "BLS Displaced Worker Survey, Jan 2026"
DWS_URL = "https://www.bls.gov/news.release/disp.htm"
GMAC = "GMAC tuition survey + Stanford/HBS class of 2025 employment reports"
GMAC_URL = "https://www.clearadmit.com/2025/12/stanford-gsb-employment-report-mba-class-of-2025/"
KRUZE = "Kruze Consulting startup CEO salary report 2026"
KRUZE_URL = "https://kruzeconsulting.com/blog/startup-ceo-salary-report/"
CARTA_SEED = "Carta seed and Series A data via SaaStr / Chronograph"
CARTA_SEED_URL = "https://www.chronograph.pe/current-trends-in-the-series-a-and-seed-venture-markets/"
CARTA_COMP = "Carta State of Startup Compensation H2 2025"
CARTA_COMP_URL = "https://carta.com/data/startup-compensation-h2-2025/"
CARTA_FIRST = "Carta, first-ten-hires equity (9,000+ grants)"
CARTA_FIRST_URL = "https://carta.com/data/linkedin-first-employee-equity-how-much/"
CARTA_DIL = "Carta median dilution per round (2,005 US software startups)"
CARTA_DIL_URL = "https://startupa.ge/blog/startup-equity-dilution-guide"
CARTA_EX = "Carta option exercise rates, Q4 2024"
CARTA_EX_URL = "https://carta.com/data/linkedin-employee-equity-exercise-rate-two-thirds-dont/"
CARTA_PTE = "Carta post-termination exercise windows"
CARTA_PTE_URL = "https://carta.com/blog/extend-pte-window/"
CARTA_TENDER = "Carta State of Private Markets 2025 in review (tender offers)"
CARTA_TENDER_URL = "https://carta.com/data/state-of-private-markets-q4-2025/"
CARTA_TERMS = "Carta deal terms Q1 2024 (liquidation preference)"
CARTA_TERMS_URL = "https://carta.com/data/deal-terms-q1-2024/"
INDEX = "Index Ventures OptionPlan benchmarks"
INDEX_URL = "https://www.indexventures.com/rewarding-talent/allocation-considerations-and-benchmarks"
CORR = "Correlation Ventures, distribution of VC investment outcomes"
CORR_URL = "https://www.thevccorner.com/p/venture-capital-fund-math-explained"
PB_C = "PitchBook Series C cohort 2010-2015 (via Collective Liquidity)"
PB_C_URL = "https://www.collectiveliquidity.com/articles/bets-on-pre-ipo-companies-are-binary-heres-what-smart-investors-do-instead"
MA_SIZE = "VC M&A size distribution (92% under $50M by count)"
MA_SIZE_URL = "https://blog.mean.ceo/startup-ma-exits-acqui-hires-valuations-statistics/"
BED = "BLS Business Employment Dynamics, establishment survival"
BED_URL = "https://www.bls.gov/spotlight/2024/business-employment-dynamics-twentieth-anniversary/home.htm"
DAVIS = "Davis, Haltiwanger, Handley, Jarmin, Lerner, Miranda (AER 2014; NBER w26371)"
DAVIS_URL = "https://www.nber.org/papers/w26371"
PE_HOLD = "S&P Global, PE holding periods 2025 (median 6.0 years)"
PE_HOLD_URL = "https://www.spglobal.com/market-intelligence/en/news-insights/articles/2025/12/private-equity-buyouts-record-longer-holding-periods-in-2025-96348743"
HOURS = "Consulting and tech weekly-hours compilations"
HOURS_URL = "https://www.hackingthecaseinterview.com/pages/consulting-hours-per-week"
EST = "Estimate, see research notes"
VANG = "Vanguard, How America Saves 2025"
VANG_URL = "https://www.asppa-net.org/news/2025/8/a-robust-report-on-savings/"
BLS_ECEC = "BLS Employer Costs for Employee Compensation"
BLS_ECEC_URL = "https://www.bls.gov/news.release/ecec.htm"
BLS_EBS = "BLS Employee Benefits Survey 2025 (retirement access by establishment size)"
BLS_EBS_URL = "https://www.bls.gov/news.release/archives/ebs2_09252025.htm"
MYPLAN = "Firm 401(k) plan filings (McKinsey PSRP, Deloitte, others via MyPlanIQ) and firm salary guides"
MYPLAN_URL = "https://www.myplaniq.com/invest/plancontribution-match/mckinsey-company-inc-psrp-profit-sharing-retirement-plan"
DSZ = "Dynan, Skinner and Zeldes, Do the Rich Save More? (SCF saving rates by income)"
DSZ_URL = "https://www.nber.org/papers/w7906"
DAMODARAN = "Damodaran, historical returns on stocks, bonds and bills 1928-2025"
DAMODARAN_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html"
SCF = "Federal Reserve Survey of Consumer Finances 2022, Bulletin Table 2"
SCF_URL = "https://www.federalreserve.gov/publications/files/scf23.pdf"

CARTA_NOTE = "Carta data is survivor-conditioned (dead companies churn off) and AI-inflated in 2025-26; shaded pessimistic."

TRACKS3 = ["startup", "corporate", "consulting"]
STAGES = ["seed", "seriesAB", "growth", "bootstrapped", "pe"]
PERSONAS = ["technical", "nontechnical"]


def ladder(vals, source, kind, url=None, note=None):
    return [S(v, source, kind, url, note) for v in vals]


def stage(*, fail, exit_, layoff, exit_median, exit_sigma, pref, grant_t, grant_n, strike,
          discount, secondary, exercise, ypr, dilution, graduate, notes):
    n = notes
    return {
        "failHazard": S(fail, n["fail"][0], "estimated", n["fail"][1], n["fail"][2]),
        "exitHazard": S(exit_, n["exit"][0], "estimated", n["exit"][1], n["exit"][2]),
        "layoffHazard": S(layoff, n["layoff"][0], "estimated", n["layoff"][1], n["layoff"][2]),
        "exitMedian": S(exit_median, n["value"][0], "estimated", n["value"][1], n["value"][2]),
        "exitSigma": S(exit_sigma, MA_SIZE, "derived", MA_SIZE_URL, "Lognormal sigma fit to 92% of exits under $50M and 3.6% at $500M+, tightening with stage."),
        "prefStack": S(pref, n["pref"][0], "derived", n["pref"][1], n["pref"][2]),
        "grantPctFD": {
            "technical": S(grant_t, n["grant"][0], "estimated", n["grant"][1], n["grant"][2]),
            "nontechnical": S(grant_n, CARTA_COMP, "estimated", CARTA_COMP_URL, "Business hires sit at the lower end of Carta's ranges; roughly half the engineering grant."),
        },
        "strikeFrac": S(strike, n["strike"][0], "estimated", n["strike"][1], n["strike"][2]),
        "salaryDiscount": S(discount, n["discount"][0], "estimated", n["discount"][1], n["discount"][2]),
        "secondaryProb": S(secondary, CARTA_TENDER, "estimated", CARTA_TENDER_URL, "396 tenders on Carta in 2025, about 1% of companies overall and 8-12% of Series C+; 20% of Series E+."),
        "pExerciseOnLeave": S(exercise, CARTA_EX, "estimated", CARTA_EX_URL, "32% of vested in-the-money grants were exercised in Q4 2024; cheap seed strikes raise the rate, growth-stage cost and AMT lower it; RSUs need no exercise."),
        "yearsPerRound": S(ypr, CARTA_SEED, "measured" if ypr < 100 else "derived", CARTA_SEED_URL, "Seed-to-A median 2.1 years in 2025; later rounds about 2 years." if ypr < 100 else "No priced rounds."),
        "graduationProb": S(graduate, CARTA_SEED, "measured" if graduate > 0 else "derived", CARTA_SEED_URL, "Conditional on surviving to the round: about 50% of seed companies reach A within 4 years and 60% graduate each later round; companies that miss the round stay at their stage with its hazards." if graduate > 0 else "No priced rounds."),
        "dilutionPerRound": S(dilution, CARTA_DIL, "measured" if dilution > 0 else "derived", CARTA_DIL_URL, "Carta medians: seed 19.5%, A 18%, B 14%, C 10%, plus 2-4 points of option-pool top-up." if dilution > 0 else "No priced rounds."),
    }


NO_LAYOFF_SRC = (EST, None, "Layoff without shutdown; 2022-25 tech layoffs ran 2-4.5% of tech employment per year, concentrated at funded startups.")

PARAMS: dict[str, Any] = {
    "horizon": 35,
    "plinkoYears": 30,
    "milestones": [3, 5, 10, 15, 20, 30, 35],
    "discountRate": S(0.03, "Conventional real discount rate", "estimated"),
    "ability": {
        "sigma": S(0.25, EST, "estimated", None, "Persistent within-education earnings dispersion; lognormal sigma drawn once per career."),
        "annualNoise": S(0.06, EST, "estimated", None, "Transitory real wage noise, roughly N(0, 6%) per year."),
    },
    "start": {
        "corporate": {
            "technical": S(106_000, f"{LEVELS}; {NACE}", "derived", LEVELS_URL,
                           "Mixture: 25% at big-tech-tier new-grad total comp ($160K) and 75% at NACE software-engineering pay ($88K). Only 13% of 2025 CS grads landed at the 12 largest tech firms."),
            "nontechnical": S(72_000, NACE, "measured", NACE_URL,
                              "NACE business majors $67K; F500 rotational programs about $75K."),
        },
        "consulting": {
            "technical": S(110_000, MBB, "measured", MBB_URL, "Mixture: 30% MBB analyst total cash ($135K, frozen since 2023) and 70% Big 4 / tier-2 analyst ($100K)."),
            "nontechnical": S(110_000, MBB, "measured", MBB_URL, "Consulting pays the same regardless of major."),
        },
    },
    # Multipliers of year-1 pay at each of five rungs, real dollars. Rungs are
    # reached by the promotion clock below, not by age.
    "levelMult": {
        "corporate": {
            "technical": ladder([1.0, 1.42, 1.85, 2.3, 2.8], f"{LEVELS}; {DEMING}", "derived", LEVELS_URL,
                                "Blend of Levels.fyi level multipliers (mid 1.46, senior 2.01, staff 2.95, principal 3.55) with the bachelor's age-earnings profile, which roughly doubles real pay over a career."),
            "nontechnical": ladder([1.0, 1.3, 1.6, 1.9, 2.2], DEMING, "derived", DEMING_URL,
                                   "Bachelor's real pay profile: 1.35x at year 5, 1.65x at 10, 1.85x at 15, 2.0x at 20, flat after."),
        },
        "consulting": {
            "technical": ladder([1.0, 1.5, 2.3, 3.0, 6.5], MBB, "measured", MBB_URL,
                                "Analyst $135K, associate ~$200K, EM $280-330K, AP $330-420K, partner $700K-1.5M at MBB; Deloitte analyst $100K to MD $450K-1M+."),
            "nontechnical": ladder([1.0, 1.5, 2.3, 3.0, 6.5], MBB, "measured", MBB_URL, "Same ladder as technical."),
        },
    },
    "promotion": {
        "corporate": {"yearsPerRung": ladder([3, 4, 6, 9], LEVELS, "estimated", LEVELS_URL, "Levels.fyi typical years per level: 2-3 to mid, 3-4 to senior, 5+ to staff; principal rare.")},
        "consulting": {
            "yearsPerRung": ladder([2.5, 2.5, 3, 4], UPOROUT, "measured", UPOROUT_URL, "BA to associate 2-3 years, associate to EM 2-3, EM to AP 2-3, AP to partner 3-4."),
            "pCounseledOut": ladder([0.10, 0.13, 0.15, 0.20], UPOROUT, "estimated", UPOROUT_URL, "Gate pass rates of roughly 0.75 / 0.70 / 0.65 / 0.50 spread over each rung's clock; about 10% a year counseled out."),
        },
        "startup": {"yearsPerRung": ladder([2.5, 3.5, 5, 8], EST, "estimated", None, "Titles move faster at startups; pay follows the corporate curve for the persona.")},
    },
    "layoff": {
        "annualHazard": {
            "corporate": S(0.045, JOLTS, "estimated", JOLTS_URL, "JOLTS 2025 layoffs and discharges: 1.2%/month all private, 2.0% professional services, 1.3% information; scaled by about a third for tenured professionals (tech 5%, non-tech 4%)."),
            "consulting": S(0.02, EST, "estimated", None, "Involuntary exits in consulting mostly arrive as counseling out, modeled separately."),
        },
        "unemploymentMonths": S(3, DWS, "measured", DWS_URL, "Median unemployment spell for management, business and financial occupations 11.4 weeks (2025)."),
        "reentryHaircut": S(0.04, DWS, "estimated", DWS_URL, "Only 49% of displaced long-tenured workers earned at least their prior pay in Jan 2026; 19% earned 20%+ less; mean ratio about 0.97, applied as a persistent scar."),
    },
    "startup": {
        "seed": stage(fail=0.16, exit_=0.04, layoff=0.05, exit_median=15_000_000, exit_sigma=1.7, pref=6_000_000,
                      grant_t=0.0020, grant_n=0.0010, strike=0.20, discount=0.25, secondary=0.01, exercise=0.45, ypr=2.1, dilution=0.22, graduate=0.65,
                      notes={
                          "fail": (CARTA_SEED, CARTA_SEED_URL, "About half of seed companies reach Series A within 4 years (15% within 2 for the 2022 cohort); most of the rest shut down or acquihire. 5-year cumulative near 58%. " + CARTA_NOTE),
                          "exit": (MA_SIZE, MA_SIZE_URL, "Seed-era exits are mostly small acquihires and come after progression."),
                          "layoff": NO_LAYOFF_SRC,
                          "value": (MA_SIZE, MA_SIZE_URL, "92% of VC M&A is under $50M by count and undisclosed acquihires pull the true median under $25M; about half of seed-era exits leave common with nothing."),
                          "pref": (CARTA_SEED, CARTA_SEED_URL, "Pre-seed ~$1.5M plus seed ~$4M (Carta Q1 2026 median seed $4.1M)."),
                          "grant": (CARTA_FIRST, CARTA_FIRST_URL, "Hire #1 median 1.5%, hires 2-5 at 0.85/0.50/0.44/0.33%, hire 6 about 0.3% for a senior; a new grad joining as hire 6-15 sits at 0.1-0.3%."),
                          "strike": (INDEX, INDEX_URL, "409A strike about 20% of preferred price at seed/A."),
                          "discount": (CARTA_COMP, CARTA_COMP_URL, "Seed base pay about $80K for a new grad vs a $106K blended corporate anchor; cash-only discount 10-25% by stage, the rest of the gap is illiquid equity valued separately."),
                      }),
        "seriesAB": stage(fail=0.10, exit_=0.07, layoff=0.07, exit_median=80_000_000, exit_sigma=1.5, pref=60_000_000,
                          grant_t=0.0005, grant_n=0.00025, strike=0.30, discount=0.10, secondary=0.03, exercise=0.30, ypr=2.0, dilution=0.18, graduate=0.70,
                          notes={
                              "fail": (CARTA_SEED, CARTA_SEED_URL, "About 60% per-round graduation over roughly two years implies 10% a year. " + CARTA_NOTE),
                              "exit": (MA_SIZE, MA_SIZE_URL, "M&A is 94% of VC exits by count (995 acquisitions vs 62 IPOs in 2025)."),
                              "layoff": NO_LAYOFF_SRC,
                              "value": (CARTA_SEED, CARTA_SEED_URL, "Median sits near the post-B valuation ($120-160M) shaded down for undisclosed small deals."),
                              "pref": (CARTA_SEED, CARTA_SEED_URL, "$4M seed + $20M A + $40M B plus bridges."),
                              "grant": (INDEX, INDEX_URL, "Index OptionPlan junior engineer 0.05-0.1% at Series A; midpoint of A and B for a new grad."),
                              "strike": (INDEX, INDEX_URL, "About 30% of preferred at Series B."),
                              "discount": (CARTA_COMP, CARTA_COMP_URL, "Series A-B new-grad cash about $95K vs the $106K corporate blend."),
                          }),
        "growth": stage(fail=0.05, exit_=0.09, layoff=0.08, exit_median=400_000_000, exit_sigma=1.3, pref=200_000_000,
                        grant_t=0.00006, grant_n=0.00003, strike=0.30, discount=0.0, secondary=0.10, exercise=0.60, ypr=2.0, dilution=0.12, graduate=0.70,
                        notes={
                            "fail": (PB_C, PB_C_URL, "62% of a 1,102-company Series C cohort had no exit after 10 years; assume about 40% of those are dead or written down."),
                            "exit": (PB_C, PB_C_URL, "38% exit within a decade of Series C; median founding-to-IPO age 12 years (Ritter 2025)."),
                            "layoff": NO_LAYOFF_SRC,
                            "value": (CARTA_SEED, CARTA_SEED_URL, "Series C+ post-money around $300-400M with IPO upside in the tail."),
                            "pref": (CARTA_SEED, CARTA_SEED_URL, "A-B stack plus a $70-100M C and part of a D."),
                            "grant": (CARTA_COMP, CARTA_COMP_URL, "RSU package of about $40-60K over four years on a $700M-1B company."),
                            "strike": (INDEX, INDEX_URL, "Options strike at 60% of preferred pre-IPO; about half of growth grants are RSUs with no strike, so 30% blended."),
                            "discount": (CARTA_COMP, CARTA_COMP_URL, "Growth-stage new-grad cash about $115K, at or above the corporate blend."),
                        }),
        "bootstrapped": stage(fail=0.08, exit_=0.03, layoff=0.04, exit_median=8_000_000, exit_sigma=1.2, pref=0,
                              grant_t=0.0, grant_n=0.0, strike=0.0, discount=0.15, secondary=0.0, exercise=0.0, ypr=999, dilution=0.0, graduate=0.0,
                              notes={
                                  "fail": (BED, BED_URL, "BLS establishment survival 51% at 5 years and 35% at 10; an employee joins after year 1 and closures include sales, so 8%."),
                                  "exit": (EST, None, "Small-business sale at 1-2x revenue; rare and rarely shared with employees."),
                                  "layoff": (EST, None, "Owner-funded firms cut slowly but cannot borrow through a bad year."),
                                  "value": (EST, None, "A small-business sale."),
                                  "pref": (EST, None, "No preferred stock."),
                                  "grant": (EST, None, "Equity is rare; when it exists it is usually phantom stock or a profit interest."),
                                  "strike": (EST, None, "No options."),
                                  "discount": (EST, None, "Owner-funded firms pay below the venture-backed market."),
                              }),
        "pe": stage(fail=0.03, exit_=0.17, layoff=0.07, exit_median=300_000_000, exit_sigma=1.0, pref=150_000_000,
                    grant_t=0.0, grant_n=0.0, strike=0.0, discount=0.0, secondary=0.0, exercise=0.0, ypr=999, dilution=0.0, graduate=0.0,
                    notes={
                        "fail": (DAVIS, DAVIS_URL, "Bankruptcies about 2% of PE exits plus distress."),
                        "exit": (PE_HOLD, PE_HOLD_URL, "Median hold 6.0 years; secondary buyouts are about 30% of exits by count."),
                        "layoff": (DAVIS, DAVIS_URL, "Employment falls 13% in public-to-private deals over two years; net -1% overall; earnings per worker -1.7%."),
                        "value": (EST, None, "About 2x entry enterprise value on a $150M entry."),
                        "pref": (EST, None, "Leverage modeled as a senior claim of about half of entry value."),
                        "grant": (DAVIS, DAVIS_URL, "Management incentive pools of 8-20% go to a small senior group; a new grad gets none."),
                        "strike": (EST, None, "No options."),
                        "discount": (DAVIS, DAVIS_URL, "PE pays market cash with bonus; earnings per worker about flat."),
                    }),
    },
    "vestYears": S(4, CARTA_COMP, "measured", CARTA_COMP_URL, "Four-year vest is universal at VC stages."),
    "cliffYears": S(1, CARTA_COMP, "measured", CARTA_COMP_URL, "One-year cliff."),
    "secondaryFrac": S(0.2, CARTA_TENDER, "estimated", CARTA_TENDER_URL, "Tender sale caps are typically 10-25% of vested holdings."),
    "stageMix": {
        "seed": S(0.10, CARTA_COMP, "derived", CARTA_COMP_URL, "Employee-weighted mix of Carta headcount by stage is about 12/33/55; shifted toward growth because campus recruiting is a growth-stage activity."),
        "seriesAB": S(0.30, CARTA_COMP, "derived", CARTA_COMP_URL, "See seed."),
        "growth": S(0.60, CARTA_COMP, "derived", CARTA_COMP_URL, "See seed."),
        "bootstrapped": S(0.0, EST, "derived", None, "A deliberate pick, not part of the venture-backed blend."),
        "pe": S(0.0, EST, "derived", None, "A deliberate pick, not part of the venture-backed blend."),
    },
    "rejoinStartup": S(0.5, EST, "estimated", None, "Share of startup employees whose next job after a shutdown or layoff is another startup."),
    "gradschool": {
        "years": S(2, GMAC, "measured", GMAC_URL, "Two-year full-time MBA."),
        "annualCost": S(112_000, GMAC, "measured", GMAC_URL, "Top-3 two-year tuition $157-185K plus living, about $225K total; foregone pay is implicit in the zero salary."),
        "postSalaryMult": S(1.3, GMAC, "estimated", GMAC_URL, "Class of 2025 median base $185K plus $30K signing at top programs, on top of the rung jump."),
        "landing": {
            "corporate": S(0.55, GMAC, "estimated", GMAC_URL, "Post-MBA destinations: finance, tech and corporate about 55%."),
            "consulting": S(0.32, GMAC, "estimated", GMAC_URL, "Consulting about a third of top-program classes."),
            "startup": S(0.13, GMAC, "estimated", GMAC_URL, "Startups and founding about a tenth."),
        },
    },
    "founder": {
        "salary": S(100_000, KRUZE, "measured", KRUZE_URL, "Seed CEO average $147K in 2025 on Kruze payroll data; pre-seed and non-CEO co-founders lower, so $100K blended."),
        "pctFD": S(0.25, CARTA_SEED, "derived", "https://carta.com/data/founder-ownership-2026/", "Founder team owns 56% after seed; split between two co-founders, then diluted per round like any holder."),
        "postExitLevelBump": S(1, EST, "estimated", None, "A founder who sells joins the acquirer one rung up."),
        "failMult": S(2.0, CORR, "estimated", CORR_URL, "A new company is pre-seed, not seed: most never raise at all. Doubling the seed shutdown hazard puts founder outcomes near 60% dead by year 4 and about one in ten at a real exit."),
    },
    # Milestone choice weights among the legal options; non-stay weights decay
    # by decayPerMilestone at each successive milestone.
    "choice": {
        "startup": {"stay": S(0.55, EST, "estimated", None, "Startup employees churn; median tenure about 2 years."), "corporate": S(0.27, EST, "estimated"), "consulting": S(0.02, EST, "estimated"), "startup": S(0.08, EST, "estimated", None, "Another startup."), "mba": S(0.04, GMAC, "estimated", GMAC_URL), "found": S(0.05, EST, "estimated", None, "Startup-first grads found at about twice the corporate rate.")},
        "corporate": {"stay": S(0.78, EST, "estimated", None, "Voluntary switching 15/10/6/4% a year by decade of age."), "corporate": S(0.0, EST, "derived"), "consulting": S(0.02, EST, "estimated"), "startup": S(0.10, EST, "estimated"), "mba": S(0.05, GMAC, "estimated", GMAC_URL, "About 5% of corporate hires go to an MBA within five years."), "found": S(0.03, EST, "estimated", None, "Founding by year 15: technical 5%, non-technical 2.5%.")},
        "consulting": {"stay": S(0.45, UPOROUT, "estimated", UPOROUT_URL, "Consulting turnover 20-30% a year; average tenure 2.7 years."), "corporate": S(0.35, UPOROUT, "estimated", UPOROUT_URL), "consulting": S(0.0, EST, "derived"), "startup": S(0.08, EST, "estimated"), "mba": S(0.09, GMAC, "estimated", GMAC_URL, "Ex-consultants are 31-35% of top MBA classes; about 15% of consultants go within five years."), "found": S(0.03, EST, "estimated")},
        "founder": {"stay": S(0.85, EST, "estimated"), "corporate": S(0.10, EST, "estimated"), "consulting": S(0.0, EST, "derived"), "startup": S(0.05, EST, "estimated"), "mba": S(0.0, EST, "derived"), "found": S(0.0, EST, "derived")},
        "decayPerMilestone": S(0.75, EST, "estimated", None, "Switching propensity falls with age: 15/10/6/4% a year by decade."),
    },
    # Retirement contributions, savings and returns. See research/sources_benefits.md.
    "benefits": {
        "employerRetirement": {
            "corporate": {
                "technical": S(0.05, VANG, "measured", VANG_URL, "Vanguard promised match 4.6% of pay; big-tech blend 4.5-5.5% (Google, Meta, Microsoft 50% to the IRS limit; Apple 3%; Amazon 2%); BLS management and professional employer retirement cost 5.4% of wages."),
                "nontechnical": S(0.05, BLS_ECEC, "measured", BLS_ECEC_URL, "BLS ECEC: employer defined-contribution cost about 5% of wages for management, professional and related occupations at large private employers."),
            },
            "consulting": {
                "technical": S(0.05, MYPLAN, "estimated", MYPLAN_URL, "MBB new-grad contributions about 6.2% (McKinsey PSRP 7.5%, BCG 5% plus 1.5%, Bain 4.5%) against Big 4 about 3.4% (Deloitte and EY 1.5%, PwC 4.5%, KPMG 6-8% automatic); 30/70 blend."),
                "nontechnical": S(0.05, MYPLAN, "estimated", MYPLAN_URL, "Same blend."),
            },
            "startup": {
                "seed": S(0.005, BLS_EBS, "derived", BLS_EBS_URL, "About 55% of seed companies run a plan, 30% of those match, at a 3-4% safe-harbor rate: 0.6% expected. Safe-harbor matches vest immediately."),
                "seriesAB": S(0.015, BLS_EBS, "derived", BLS_EBS_URL, "Access by establishment size (BLS) times the share that match times a 3-4% rate."),
                "growth": S(0.025, BLS_EBS, "derived", BLS_EBS_URL, "Growth-stage companies mostly offer a plan; matches remain below the corporate norm."),
                "bootstrapped": S(0.02, BLS_EBS, "derived", BLS_EBS_URL, "Under-50-employee firms: 45% have no plan; those with one use a 3% nonelective or 4% match."),
                "pe": S(0.035, BLS_ECEC, "estimated", BLS_ECEC_URL, "Market-rate plan, often trimmed after the buyout."),
            },
        },
        "matchVestYears": S(2, VANG, "estimated", VANG_URL, "Vanguard: 43% of plans vest employer money immediately, the rest on 2-6 year cliff or graded schedules; forfeitures occur in about 30% of separations. Modeled as two-year graded vesting on the employer contribution."),
        "savingsBands": [
            {"upTo": S(80_000, DSZ, "measured", DSZ_URL, "SCF median saving rate by income: second and third quintiles about 9%; rounded up for a professional with employer plan access."), "rate": S(0.10, DSZ, "measured", DSZ_URL)},
            {"upTo": S(150_000, DSZ, "measured", DSZ_URL, "Fourth quintile 14.4%."), "rate": S(0.14, DSZ, "measured", DSZ_URL)},
            {"upTo": S(250_000, DSZ, "measured", DSZ_URL, "Between the fourth and fifth quintiles."), "rate": S(0.18, DSZ, "measured", DSZ_URL)},
            {"upTo": S(1_000_000_000_000, DSZ, "measured", DSZ_URL, "Top quintile 26.5%, top 5% 36.8%; 22% is a conservative reading."), "rate": S(0.22, DSZ, "measured", DSZ_URL)},
        ],
        "windfallSavingsRate": S(0.45, DSZ, "estimated", DSZ_URL, "High earners save about 70% of an after-tax windfall; on the model's pre-tax dollars that is roughly 45% of the gross amount."),
        "realReturn": S(0.045, DAMODARAN, "measured", DAMODARAN_URL, "S&P 500 with dividends 6.8% real, 1928-2025; a 60/40 portfolio about 5.2%; forward-looking estimates for the next decade run 2.5-3.5%. 4.5% is a diversified, slightly conservative long-run figure."),
    },
    # 0 = no demand, 1 = all-consuming. Life demand from weekly hours; cash
    # demand from how far pay sits from a comfortable professional budget.
    "demand": {
        "corporate": {"life": ladder([0.35, 0.4, 0.5, 0.6, 0.7], HOURS, "estimated", HOURS_URL, "Big tech about 47 hours a week, other corporate 44, rising with seniority."),
                      "cash": ladder([0.4, 0.3, 0.2, 0.15, 0.1], EST, "estimated")},
        "consulting": {"life": ladder([0.8, 0.8, 0.85, 0.85, 0.8], HOURS, "estimated", HOURS_URL, "MBB about 60 hours, Big 4 about 50, plus travel."),
                       "cash": ladder([0.3, 0.2, 0.15, 0.1, 0.05], EST, "estimated")},
        "startup": {"life": ladder([0.65, 0.7, 0.75, 0.8, 0.85], HOURS, "estimated", HOURS_URL, "About 55 hours a week."),
                    "cash": ladder([0.6, 0.5, 0.4, 0.35, 0.3], EST, "estimated", None, "Below-market cash and illiquid paper wealth.")},
        "founder": {"life": ladder([0.95] * 5, HOURS, "estimated", HOURS_URL, "About 65 hours a week."), "cash": ladder([0.85] * 5, KRUZE, "estimated", KRUZE_URL)},
        "gradschool": {"life": ladder([0.5] * 5, EST, "estimated"), "cash": ladder([0.9] * 5, GMAC, "estimated", GMAC_URL, "Tuition out, no salary in.")},
    },
}


def to_json(obj: Any) -> Any:
    if isinstance(obj, S):
        return {k: v for k, v in asdict(obj).items() if v is not None}
    if isinstance(obj, dict):
        return {k: to_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_json(v) for v in obj]
    return obj


def plain(obj: Any) -> Any:
    """Strip the sourcing so the engine sees bare numbers."""
    if isinstance(obj, S):
        return obj.value
    if isinstance(obj, dict):
        if "value" in obj and "source" in obj:
            return obj["value"]
        return {k: plain(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [plain(v) for v in obj]
    return obj


def flatten(obj: Any, prefix: str = "") -> list[dict]:
    """One row per sourced leaf, for the methodology table."""
    rows: list[dict] = []
    if isinstance(obj, S):
        rows.append({"path": prefix, **{k: v for k, v in asdict(obj).items() if v is not None}})
    elif isinstance(obj, dict):
        for k, v in obj.items():
            rows.extend(flatten(v, f"{prefix}.{k}" if prefix else k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            rows.extend(flatten(v, f"{prefix}[{i}]"))
    return rows


if __name__ == "__main__":
    blob = json.dumps(to_json(PARAMS), indent=1)
    (HERE / "params.json").write_text(blob)
    dest = publish("params.json", blob)
    rows = flatten(PARAMS)
    est = sum(1 for r in rows if r["kind"] == "estimated")
    print(f"wrote {dest} ({len(rows)} sourced values, {est} still estimated)")
