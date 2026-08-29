/**
 * What the signup page says, per source.
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
 * `id` doubles as the stored source value and as the `?from=` parameter on
 * /updates, so the button, the page and the dashboard all read back in one
 * vocabulary.
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
  headline: "Get more like this when it comes",
  blurb:
    "A new project lands here every few weeks — a model, a tool, or an analysis worth reading. Leave an address and I will send a note when the next one does.",
  notePrompt: "What do you want to see next?",
  cta: "Send me updates",
};

/**
 * The playbook speaks as a product rather than as a portfolio piece, because
 * it is one: this is the only source whose signups are customers rather than
 * readers.
 */
const BY_PROJECT: Record<string, SignupCopy> = {
  "draft-sheet": {
    id: "draft-sheet",
    label: "Draft Sheet",
    headline: "More football, when I make it",
    blurb:
      "I build football things fairly often \u2014 models, tools, and the odd argument with the consensus. Leave an address and I will send a note when the next one lands. \u2014 Greg",
    notePrompt: "What would you want me to build next?",
    cta: "Add me to the list",
  },
  playbook: {
    id: "playbook",
    label: "Playbook",
    headline: "Send me playbook updates",
    blurb:
      "This is an early build, and it is getting better every week. Tell us where to send the next version, and what your team would need before it is worth using on a Saturday.",
    notePrompt: "What do you want to see next? What size team do you coach?",
    cta: "Send me updates",
  },
  "two-minute-drill": {
    id: "two-minute-drill",
    label: "Two-Minute Drill",
    headline: "Send me more like this",
    blurb:
      "The engine behind this keeps getting new situations, new seasons, and new ways to be wrong in public. Leave an address if you want to know when they land.",
    notePrompt: "What do you want to see next? An endgame worth modelling?",
    cta: "Send me updates",
  },
  "chess-coach": {
    id: "chess-coach",
    label: "Chess Coach",
    headline: "Send me more like this",
    blurb:
      "Stronger analysis, better review, and more ways to see where a game turned. I will write when there is something worth opening.",
    notePrompt: "What do you want to see next? What would help your game most?",
    cta: "Send me updates",
  },
  "glass-box-rag": {
    id: "glass-box-rag",
    label: "Glass Box RAG",
    headline: "Send me the retrieval write-ups",
    blurb:
      "I write up the retrieval and evaluation work as it develops, including the parts that did not work and the numbers that made me change my mind.",
    notePrompt: "What do you want to see next? Building something similar?",
    cta: "Send me updates",
  },
  "nfl-prospect-comparables": {
    id: "nfl-prospect-comparables",
    label: "NFL Comparables",
    headline: "Send me more like this",
    blurb:
      "The comparables engine gets a new draft class, new features, and a fresh set of arguments every cycle. I will send a note when it does.",
    notePrompt: "What do you want to see next? A prospect worth running?",
    cta: "Send me updates",
  },
  "religious-voices": {
    id: "religious-voices",
    label: "Religious Voices",
    headline: "Send me more like this",
    blurb:
      "The corpus behind this keeps growing, and so does the retrieval that reads it. Leave an address to hear about the next version.",
    notePrompt: "What do you want to see next? A voice worth including?",
    cta: "Send me updates",
  },
  "adventureworks-chat": {
    id: "adventureworks-chat",
    label: "AdventureWorks Chat",
    headline: "Send me more like this",
    blurb:
      "More work on asking real warehouses real questions in plain language. I will write when there is something worth your time.",
    notePrompt: "What do you want to see next? What would you point this at?",
    cta: "Send me updates",
  },
  "emba-roi-analysis": {
    id: "emba-roi-analysis",
    label: "EMBA ROI",
    headline: "Send me more like this",
    blurb:
      "New decision analyses land here regularly — the same treatment applied to whatever question is worth the arithmetic next.",
    notePrompt: "What do you want to see next? A decision worth modelling?",
    cta: "Send me updates",
  },
  "scale-or-sell": {
    id: "scale-or-sell",
    label: "Scale or Sell",
    headline: "Send me more like this",
    blurb:
      "New decision analyses land here regularly — the same treatment applied to whatever question is worth the arithmetic next.",
    notePrompt: "What do you want to see next? A decision you are weighing?",
    cta: "Send me updates",
  },
};

/** Every id the API will accept as a source, so a forged one is a 400. */
export const SOURCE_IDS: string[] = [HOME.id, ...Object.keys(BY_PROJECT)];

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  [HOME, ...Object.values(BY_PROJECT)].map((c) => [c.id, c.label]),
);

/**
 * Copy for a `?from=` value. An unknown or missing source falls back to the
 * generic page rather than 404ing — somebody who hand-edited the URL or lost
 * the parameter to a redirect should still be able to sign up.
 */
export function copyForSource(source: string | undefined): SignupCopy {
  if (!source) return HOME;
  if (source === HOME.id) return HOME;
  return BY_PROJECT[source] ?? HOME;
}
