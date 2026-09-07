/**
 * The first-visit tour. Targets are `data-tour` attributes; `before` switches
 * tabs by clicking the tab button so the step's target exists before driver
 * waits for it.
 */

import type { TourStep } from "@/lib/tour/types";

function showTab(id: string) {
  return () => {
    const btn = document.querySelector<HTMLButtonElement>(`.cp-tab[data-tab="${id}"]`);
    if (btn && btn.getAttribute("aria-selected") !== "true") btn.click();
  };
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="plinko"] .cp-plinko-board',
    title: "Three thousand careers",
    body:
      "Each ball is one simulated career. It falls one row per year, sitting at that year's realized pay on a log axis, and settles on its thirty-year average. Orange started at a startup, blue in a corporate job, green in consulting.",
    side: "top",
    before: showTab("plinko"),
    waitFor: 1500,
  },
  {
    target: '[data-tour="controls"]',
    title: "Change the graduate, or the startup",
    body:
      "Technical and non-technical grads get different pay curves and grant sizes. The stage picker re-drops only the startup balls: seed, Series A-B, growth, bootstrapped or PE-backed. Stay the course removes every later job switch.",
    side: "bottom",
  },
  {
    target: '[data-tour="stats"]',
    title: "Read the settled distributions",
    body:
      "Median, spread, how many careers averaged under $100K, how many had a single year over $1M, and how many averaged that much. Hover a settled ball for the story of that one career.",
    side: "top",
  },
  {
    target: '[data-tour="tabs"]',
    title: "Then choose your own",
    body:
      "Tab two walks one career through the same engine with you making the calls at each milestone, and shows where the crowd went. Tab three explains seed, Series A, preference stacks and the rest for people who have never heard the words.",
    side: "bottom",
    before: showTab("plinko"),
    doneLabel: "Drop the balls",
    onDone: () => document.querySelector<HTMLButtonElement>('[data-tel="cp-replay"]')?.click(),
  },
];

export const ADVENTURE_STEPS: TourStep[] = [
  {
    target: ".cp-adv-board",
    title: "Choose Your Own Adventure",
    body:
      "One career, walked through the same engine as the thousands on tab one, except you make the calls. Each band is a milestone year; the crowd's flow is drawn faintly behind your path once you set out.",
    side: "top",
    before: showTab("adventure"),
    waitFor: 2500,
  },
  {
    target: ".cp-adv-options",
    title: "Your decisions",
    body:
      "Pick a first job, then at years 3, 5, 10, 15, 20 and 30 choose to stay, switch tracks, get an MBA or found something. Between decisions the model rolls promotions, layoffs, shutdowns and the odd exit, and tells you what happened before you choose again.",
    side: "bottom",
    waitFor: 2500,
  },
  {
    target: ".cp-adv-pane-full",
    title: "Your scorecard",
    body:
      "Pay this year, your average, what you have earned and invested so far, and the median of every simulated career standing at the same spot. The two bars are how much the job takes from your life and how tight the cash is.",
    side: "left",
    waitFor: 1500,
  },
  {
    target: ".cp-adv-controls",
    title: "Run it again",
    body:
      "Start over draws a fresh set of dice, so the same choices can end somewhere else. Switch the graduate between technical and non-technical to change the pay curves and grant sizes underneath.",
    side: "bottom",
    doneLabel: "Start choosing",
  },
];
