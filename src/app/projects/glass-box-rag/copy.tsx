"use client";

/**
 * Reading-level system + glossary for the Glass Box RAG page.
 *
 * Every teaching string on the interactive page is authored at two levels so a
 * reader can dial the jargon down: "grad" (clear, competent — assumes a curious
 * adult) and "eli5" (plain, analogy-first). The deep, sophisticated treatment
 * lives on the /methodology page; this page teaches.
 *
 * Components read the current level from context and index a leveled string:
 *   const level = useLevel();
 *   <p>{COPY.chatEmpty[level]}</p>
 */

import { createContext, useContext, useState, type ReactNode } from "react";

export type Level = "grad" | "eli5";
type Leveled = Record<Level, string>;

const LevelContext = createContext<{
  level: Level;
  setLevel: (l: Level) => void;
}>({ level: "grad", setLevel: () => {} });

export function ReadingLevelProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<Level>("grad");
  return <LevelContext.Provider value={{ level, setLevel }}>{children}</LevelContext.Provider>;
}

export const useLevel = () => useContext(LevelContext).level;
export const useLevelState = () => useContext(LevelContext);

/** The segmented reading-level control. */
export function ReadingLevelToggle() {
  const { level, setLevel } = useLevelState();
  const opts: { key: Level; label: string; title: string }[] = [
    { key: "grad", label: "Standard", title: "Explain it like I just finished high school" },
    { key: "eli5", label: "Explain like I'm 5", title: "Explain it as simply as possible" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => setLevel(o.key)}
          title={o.title}
          className={`rounded px-2 py-0.5 text-[11px] transition ${
            level === o.key
              ? "bg-blue-700 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ copy --- */

export const COPY: Record<string, Leveled> = {
  intro: {
    grad:
      "Learn how retrieval-augmented AI actually works by watching an agent narrate itself as it runs — every search, re-ranking, and decision, live on the right. The worked example is AI and the law, an area where the courts genuinely disagree.",
    eli5:
      "This is a robot librarian that thinks out loud. Ask it a question and watch — over on the right — every step it takes to find the answer. Its books are real court cases about computers and copying.",
  },
  chatEmpty: {
    grad:
      "Answers are grounded only in 49 published U.S. opinions on AI — 32 on copyright and fair use, plus 17 spanning deliberately different terrain (algorithmic insurance denials, AI voice cloning, data scraping, biometric privacy, algorithmic hiring, chatbot harm, price-fixing, patents, and authorship) kept as a control group so retrieval has to genuinely discriminate. Where the courts disagree, the answer says so rather than picking a side.",
    eli5:
      "The robot only knows 49 real court cases about computers and AI. Most are about copying; a bunch are about very different things — fake voices, scraping, hiring robots — added on purpose to keep it honest. If the judges didn't agree, it tells you both sides instead of guessing.",
  },
  chatWorking: {
    grad: "Retrieving and reasoning — watch the pipeline →",
    eli5: "Looking through its books — watch the steps on the right →",
  },
  pipelineEmpty: {
    grad:
      "Ask a question and each retrieval stage lights up here as it runs — with its real timing and its real output. Hover a step to see its job; click one to inspect what it produced.",
    eli5:
      "Ask a question and each step lights up here as the robot does it. Point at a step to see what it's for; click it to peek at what it found.",
  },
  citationsIdle: {
    grad:
      "Modern AI decisions on the left, the fair-use lineage they argue over on the right. Gold names are the non-copyright control group — note they cluster apart, barely citing the fair-use canon. Line weight is how often one case cites another.",
    eli5:
      "New AI cases on the left; the older cases they lean on are on the right. The gold names are the odd-ones-out we added on purpose — see how they keep to themselves. Thicker lines mean one case points at another more often.",
  },
  citationsActive: {
    grad:
      "Highlighted cases were retrieved for this question; amber lines were citations the agent chose to follow.",
    eli5:
      "The glowing cases are the ones the robot used. The orange lines are the trails it decided to follow to older cases.",
  },
  embeddingIdle: {
    grad:
      "Every passage placed by meaning — similar passages sit close together. Right now each case is sized and shaded by how often the rest of the corpus cites it, so the fair-use canon stands out as the biggest, darkest hubs; the gray nodes are the non-copyright control group. Ask a question and the map re-weights to that query.",
    eli5:
      "Every page of every case, arranged so pages about the same idea sit near each other. Bigger, darker dots are the cases everyone points to; the gray ones are the odd-ones-out. Ask a question and the whole map changes to show what matters for it.",
  },
  embeddingActive: {
    grad:
      "Now sized by relevance to your question: the cases the search pulled in grow and turn blue, the ones it actually used in the answer are the biggest and darkest, and everything it ignored fades to gray. Watch a non-copyright question light up cases that sat gray a moment ago.",
    eli5:
      "Now the dots are sized by how useful they were for your question. The ones the robot pulled in turn blue, the ones it actually used are biggest and darkest, and everything it skipped fades away.",
  },
  evalIntro: {
    grad:
      "Each bar is one retrieval configuration, measured against a 34-question golden set with case-level ground truth — including the settings that argue against the final design. Pick a metric to re-sort. The check marks flag whether a setup ever cites a case that did not exist yet.",
    eli5:
      "Each bar is a different recipe for searching, scored on a fixed set of 34 practice questions with known right answers. Tap a score to sort by it. A check means the recipe never quoted a case from the future; a warning means it did.",
  },
};

/* --------------------------------------------------------- stage roles --- */

/**
 * What each pipeline node does, at both reading levels. Shared by the pipeline
 * diagram (hover) and the stage-detail list (expanded).
 */
export const STAGE_ROLE: Record<string, Leveled> = {
  analyze: {
    grad: "Claude reads the question: what is being asked, which fair-use factors are in play, and is it pinned to a moment in the past?",
    eli5: "The robot reads your question carefully to figure out what you're really asking — and whether you mean a specific time.",
  },
  transform: {
    grad: "Drafts a hypothetical ideal passage (HyDE) and a few reworded queries, so search-by-meaning has a better target than a bare question.",
    eli5: "The robot writes a pretend perfect answer, then hunts for real pages that look like it.",
  },
  retrieve_sparse: {
    grad: "BM25 keyword search over the corpus — the exact legal terms of art. Strong when the right case shares your wording.",
    eli5: "A word-match search: it grabs pages that use the same words you typed.",
  },
  retrieve_dense: {
    grad: "Vector search by meaning rather than wording, so it catches cases that say the same thing differently.",
    eli5: "A meaning search: it grabs pages about the same idea, even in different words.",
  },
  fuse: {
    grad: "Reciprocal Rank Fusion merges the keyword and meaning lists by rank position, not by scores that don't compare.",
    eli5: "Blends the two searches' top lists into one, going by placement instead of scores.",
  },
  temporal: {
    grad: "Drops any opinion decided after the date the question is scoped to — the fix for citing the future.",
    eli5: "Throws out cases from after the date you asked about.",
  },
  rerank: {
    grad: "A heavier cross-encoder reads the question and each finalist passage together and rescores the shortlist.",
    eli5: "A pickier reader re-sorts the finalists by looking at them next to your question.",
  },
  diversify: {
    grad: "Caps how many passages any single opinion can occupy, so one long case can't crowd out the case that disagrees.",
    eli5: "Limits how many pages come from the same book, so no book hogs the results.",
  },
  assess: {
    grad: "Claude judges whether what's retrieved is enough to answer — or whether to follow a citation to a case it hasn't seen.",
    eli5: "The robot asks itself: is this enough, or should I follow a footnote to another case?",
  },
  hop: {
    grad: "Follows a citation edge to a precedent not yet retrieved, then searches again — the agentic loop, up to ~3 hops.",
    eli5: "Follows a trail to an older case and looks again — a few times over.",
  },
  synthesize: {
    grad: "Writes the answer, grounded only in what was actually retrieved, and names the opinions it relied on.",
    eli5: "Writes the final answer using only the pages it found, and lists them.",
  },
};

/* -------------------------------------------------------------- glossary --- */

export interface GlossEntry {
  term: string;
  grad: string;
  eli5: string;
}

export const GLOSSARY: Record<string, GlossEntry> = {
  rag: {
    term: "RAG",
    grad: "Retrieval-augmented generation: before answering, the model looks up relevant source passages and answers only from those, instead of from memory. It keeps answers grounded and citable.",
    eli5: "The robot looks things up in its books first, then answers using what it found — instead of just saying whatever it remembers.",
  },
  bm25: {
    term: "BM25",
    grad: "A classic keyword-search formula that scores a passage by how often the query's exact words appear, rewarding rare words and shrinking the boost for very long passages. Strong when the right answer shares exact terms of art — as legal writing does.",
    eli5: "A word-matching search: it likes pages that use the exact words you typed, especially unusual ones. Great when the perfect page uses the same words you did.",
  },
  dense: {
    term: "Dense retrieval",
    grad: "Search by meaning rather than words: each passage and the query become vectors (lists of numbers), and passages whose vectors point in a similar direction are judged similar — so it can match paraphrases the keywords miss.",
    eli5: "Search by idea, not exact words. The robot turns each page into a point on a map, and grabs pages sitting near your question — even if they say it differently.",
  },
  embedding: {
    term: "Embedding",
    grad: "The list of numbers that stands in for a passage's meaning, produced by a neural model. Passages with similar meaning get similar numbers, which is what makes search-by-meaning possible.",
    eli5: "A page's meaning turned into a bunch of numbers, so the computer can tell which pages are about the same thing.",
  },
  fusion: {
    term: "Fusion (RRF)",
    grad: "Reciprocal Rank Fusion merges the keyword list and the meaning list into one, combining them by each result's rank position rather than its raw score — which sidesteps the fact that the two searches score on incompatible scales.",
    eli5: "The robot runs two searches and blends the two top-10 lists into one, going by where each page placed (1st, 2nd…) rather than by scores that don't compare.",
  },
  rerank: {
    term: "Cross-encoder / reranking",
    grad: "A second, heavier model that reads the question and each candidate passage together and rescores the shortlist. It is slower but sharper than the first-pass search, so it runs only on the few dozen survivors.",
    eli5: "A pickier second reader looks at your question and each shortlisted page side by side, then re-sorts them. It's slow, so it only judges the finalists.",
  },
  hyde: {
    term: "HyDE",
    grad: "Hypothetical Document Embeddings: the model first drafts a fake ideal answer, then searches with that draft instead of the raw question. The draft looks more like the target documents than a question does, so meaning-search lands closer.",
    eli5: "The robot first guesses what a perfect answer might look like, then goes looking for real pages that resemble its guess — because the guess looks more like a real page than a question does.",
  },
  diversification: {
    term: "Diversification",
    grad: "A per-case cap on how many passages from any single opinion can occupy the results. Without it, one long, on-topic opinion floods the top and crowds out the case that disagrees with it — the biggest single accuracy win in the ablation.",
    eli5: "A rule that says 'no more than a couple of pages from the same book.' It stops one long book from hogging all the slots and hiding the book that argues the other way.",
  },
  temporal: {
    term: "Temporal filter",
    grad: "A step that drops any opinion decided after the date the question is scoped to. It is the only setting that eliminates anachronisms — citing a 2023 ruling to answer what the law was in 2015.",
    eli5: "A rule that throws out cases from after the date you asked about — so the robot can't answer 'what was the law in 2015?' by quoting a case from 2023.",
  },
  agentic: {
    term: "Agentic hop",
    grad: "After the first retrieval, the agent judges whether it has enough. If not, it follows a citation from a retrieved opinion to a precedent it hasn't seen and searches again — up to about three hops.",
    eli5: "After its first look, the robot asks itself 'is this enough?' If not, it follows a footnote to an older case and looks again — a few times over.",
  },
  ablation: {
    term: "Ablation",
    grad: "An experiment that turns each component on and off and re-measures, so you can see what each part actually contributes rather than assuming the full stack is best. Some parts here earn their keep; some don't.",
    eli5: "Testing the search by switching each piece off one at a time to see which pieces actually help — instead of just trusting that more parts is better.",
  },
  recall: {
    term: "Recall",
    grad: "Of all the cases that should have been found for a question, the fraction that actually were. High recall means little was missed.",
    eli5: "Out of all the right pages, how many the robot found. High means it missed almost nothing.",
  },
  criticalRecall: {
    term: "Critical recall",
    grad: "Recall measured only over the must-have cases — the ones whose absence makes an answer wrong rather than merely thin. The headline metric here: missing the case that cuts the other way is the failure that matters.",
    eli5: "Like recall, but counting only the pages you absolutely can't miss. Missing one of those means the answer is actually wrong, not just short.",
  },
  precision: {
    term: "Precision",
    grad: "Of the cases the system returned, the fraction that were actually relevant. High precision means little junk came back.",
    eli5: "Out of everything the robot brought back, how much was actually useful. High means little junk.",
  },
  mrr: {
    term: "MRR",
    grad: "Mean Reciprocal Rank: how high the first genuinely relevant result tends to land. A first-place hit scores 1; second place, 1/2; and so on — it rewards putting a good answer at the very top.",
    eli5: "A score for how close to the top the first good result usually is. Right at #1 is best.",
  },
};

/**
 * Wraps a jargon word in a dotted underline with a hover/focus definition card
 * at the current reading level. Direct labeling beats a legend — the definition
 * meets the reader exactly where the term appears.
 */
export function Term({ id, children }: { id: keyof typeof GLOSSARY; children?: ReactNode }) {
  const level = useLevel();
  const entry = GLOSSARY[id];
  if (!entry) return <>{children}</>;
  return (
    <span className="group relative inline cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2">
      <span tabIndex={0} className="outline-none">
        {children ?? entry.term}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-64 rounded-md border border-slate-200 bg-white p-2.5 text-left text-[11px] font-normal leading-snug text-slate-600 shadow-lg group-hover:block group-focus-within:block"
      >
        <span className="mb-0.5 block font-medium text-slate-900">{entry.term}</span>
        {entry[level]}
      </span>
    </span>
  );
}
