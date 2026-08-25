/**
 * What the signup block says, per page.
 *
 * The whole reason this table stores a source is that the intent behind a
 * signup is completely different depending on where it was made. Somebody who
 * has just spent ten minutes designing flag plays wants product news about the
 * playbook; somebody reading the Glass Box RAG methodology is more likely a
 * hiring manager or an engineer. Asking both of them the same question wastes
 * the only moment either of them is willing to type anything.
 *
 * So each entry carries its own headline, its own one-line promise, and its own
 * prompt for the optional note — the note prompt being the part that changes
 * most, since it is really "what would you tell me if I asked the right
 * question".
 *
 * `id` doubles as the stored source value, so the dashboard reads back in the
 * same vocabulary the pages use.
 */

export interface SignupCopy {
  /** Stored as the lead's source. */
  id: string;
  /** Shown in the dashboard. */
  label: string;
  headline: string;
  blurb: string;
  notePrompt: string;
  cta: string;
}

const HOME: SignupCopy = {
  id: "home",
  label: "Landing page",
  headline: "Keep me updated",
  blurb:
    "A new project lands here every few weeks. Leave an address and I will send a note when the next one does.",
  notePrompt: "Anything to share right now?",
  cta: "Keep me updated",
};

/**
 * The playbook speaks as a product rather than as a portfolio piece, because
 * it is one: this is the only page whose signups are customers rather than
 * readers.
 */
const BY_PROJECT: Record<string, SignupCopy> = {
  playbook: {
    id: "playbook",
    label: "Playbook",
    headline: "Get playbook updates",
    blurb:
      "This is an early build. Tell us where to send the next version, and what your team would need before it is worth using on a Saturday.",
    notePrompt: "What size team do you coach, and what is missing here?",
    cta: "Keep me posted",
  },
  "two-minute-drill": {
    id: "two-minute-drill",
    label: "Two-Minute Drill",
    headline: "More like this",
    blurb:
      "The engine behind this is getting new situations and new seasons. Leave an address if you want to know when they land.",
    notePrompt: "An endgame you want modelled? A call you disagreed with?",
    cta: "Keep me updated",
  },
  "chess-coach": {
    id: "chess-coach",
    label: "Chess Coach",
    headline: "Keep me updated",
    blurb:
      "New review features and stronger analysis are on the way. I will write when there is something worth opening.",
    notePrompt: "What would help you or your player most?",
    cta: "Keep me updated",
  },
  "glass-box-rag": {
    id: "glass-box-rag",
    label: "Glass Box RAG",
    headline: "Retrieval, in the open",
    blurb:
      "I write up the retrieval and evaluation work as it develops, including the parts that did not work. Leave an address to get those.",
    notePrompt: "Working on something similar? Say what.",
    cta: "Send me the write-ups",
  },
  "nfl-prospect-comparables": {
    id: "nfl-prospect-comparables",
    label: "NFL Comparables",
    headline: "Keep me updated",
    blurb:
      "The comparables engine gets a new draft class and new features every cycle. I will send a note when it does.",
    notePrompt: "A prospect or a position group you want run through it?",
    cta: "Keep me updated",
  },
  "religious-voices": {
    id: "religious-voices",
    label: "Religious Voices",
    headline: "Keep me updated",
    blurb:
      "The corpus and the retrieval behind this keep growing. Leave an address if you want to hear about the next version.",
    notePrompt: "A voice or a tradition you would want included?",
    cta: "Keep me updated",
  },
  "adventureworks-chat": {
    id: "adventureworks-chat",
    label: "AdventureWorks Chat",
    headline: "Keep me updated",
    blurb:
      "More work on natural-language querying over real warehouses is coming. I will write when it is worth your time.",
    notePrompt: "What would you point this at in your own stack?",
    cta: "Keep me updated",
  },
  "emba-roi-analysis": {
    id: "emba-roi-analysis",
    label: "EMBA ROI",
    headline: "Keep me updated",
    blurb:
      "New analyses land here regularly. Leave an address and I will send the next one.",
    notePrompt: "A question you would want run the same way?",
    cta: "Keep me updated",
  },
  "scale-or-sell": {
    id: "scale-or-sell",
    label: "Scale or Sell",
    headline: "Keep me updated",
    blurb:
      "New analyses land here regularly. Leave an address and I will send the next one.",
    notePrompt: "A decision you are weighing? I read every one of these.",
    cta: "Keep me updated",
  },
};

/** Every id the API will accept as a source, so a forged one is a 400. */
export const SOURCE_IDS: string[] = [HOME.id, ...Object.keys(BY_PROJECT)];

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  [HOME, ...Object.values(BY_PROJECT)].map((c) => [c.id, c.label]),
);

/**
 * Which copy a path gets, and whether it gets any at all.
 *
 * Print sheets, share links and the telemetry dashboard return null: a
 * subscribe form has no business on a page that is about to go through a
 * printer, on a link a coach forwarded to his staff, or on Greg's own numbers.
 */
export function copyForPath(pathname: string): SignupCopy | null {
  if (pathname === "/") return HOME;
  if (pathname.startsWith("/telemetry")) return null;

  const match = /^\/projects\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;

  const [, slug, rest = ""] = match;
  if (rest.startsWith("/print") || rest.startsWith("/share")) return null;

  return BY_PROJECT[slug] ?? null;
}
