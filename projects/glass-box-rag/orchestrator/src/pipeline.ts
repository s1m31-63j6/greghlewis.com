/**
 * The pipeline. Each stage emits its real intermediate artifact so the UI can
 * render a faithful trace.
 *
 * Stage order and configuration come from the measured ablation
 * (data/build/ablation.json), not from intuition:
 *   hybrid + as-of filter + rerank + diversify-AFTER-rerank
 *   critical recall 0.921 | MRR 0.855 | zero anachronisms
 */

import { citedBy, loadIndex } from "./corpus.js";
import type { RankedDoc, StageName, StreamEvent } from "./events.js";
import { askJson, streamText } from "./llm.js";
import {
  asOfFilter,
  diversify,
  embedQuery,
  rerank,
  rrf,
  type Hit,
  type Index,
} from "./retrieval.js";

export type Emit = (e: StreamEvent) => void;

const MAX_HOPS = 3;
const CANDIDATES = 30;
const TOP = 10;
const PER_CASE = 2;

/**
 * HyDE is OFF, and that is a measured decision rather than an omission.
 *
 * Adding the hypothetical-opinion passage to the retrieval probe:
 *   critical recall  0.921 -> 0.895   (worse — the metric that governs)
 *   overall recall   0.811 -> 0.837   (better)
 *   precision        0.375 -> 0.406   (better)
 *   MRR              0.855 -> 0.846   (about the same)
 *
 * It broadens retrieval but loses the specific counterpoint case: on "does market
 * dilution defeat fair use", the bare question retrieves Bartz, the HyDE-augmented
 * probe does not — because generic fair-use prose pulls toward the classic ancestor
 * cases. In legal research, missing the case that cuts the other way makes the
 * answer wrong, not merely thinner. So critical recall wins.
 */
const USE_HYDE = false;

function toDocs(index: Index, hits: Hit[], prev?: Hit[]): RankedDoc[] {
  const prevRank = new Map(prev?.map((h, i) => [h.idx, i]));
  return hits.map((h) => {
    const c = index.chunks[h.idx];
    return {
      chunk_id: c.id,
      case_id: c.case_id,
      case_name: c.case_name,
      court: c.court,
      court_level: c.court_level,
      year: c.year,
      section: c.section,
      score: h.score,
      snippet: c.text.slice(0, 240).replace(/\s+/g, " ").trim(),
      prev_rank: prevRank.get(h.idx),
    };
  });
}

async function stage<T>(
  emit: Emit,
  name: StageName,
  hop: number,
  label: string,
  fn: () => Promise<T> | T,
  render?: (r: T) => { docs?: RankedDoc[]; detail?: Record<string, unknown> },
): Promise<T> {
  emit({ type: "stage_start", stage: name, hop, label });
  const t0 = Date.now();
  const result = await fn();
  const extra = render?.(result) ?? {};
  emit({ type: "stage_end", stage: name, hop, ms: Date.now() - t0, ...extra });
  return result;
}

// ---------- stage 1: analyze ----------

const ANALYZE_SYSTEM = `You analyse legal research questions about U.S. copyright and fair use.

Return ONLY JSON:
{
  "intent": "one short phrase describing what is being asked",
  "as_of": <4-digit year or null>,
  "factors": ["fair use factor or doctrine at issue", ...],
  "reasoning": "one or two sentences"
}

"as_of" is the year the question is scoped to, and it is the single most important
field. Set it ONLY when the question asks about the state of the law at a past
moment — phrases like "as of", "at the time of", "when X was decided", or a
question framed in the past tense about what the law "was". Otherwise null.
Getting this wrong causes the system to cite decisions that did not exist yet.`;

export interface Analysis {
  intent: string;
  as_of: number | null;
  factors: string[];
  reasoning: string;
}

// ---------- stage 2: transform ----------

const HYDE_SYSTEM = `You write a short passage in the voice of a U.S. federal judicial opinion
that would answer the user's question, and a few alternative phrasings of the question.

The passage is never shown to anyone — it is used only as a retrieval probe, so it
should read like the TARGET documents (judicial prose, doctrinal vocabulary,
citations to factors) rather than like an answer to a user.

Return ONLY JSON:
{"hyde": "<120-200 words of judicial prose>", "variants": ["<rephrasing>", "<rephrasing>"]}`;

export interface Transform {
  hyde: string;
  variants: string[];
}

// ---------- stage 6: assess ----------

const ASSESS_SYSTEM = `You decide whether a set of retrieved judicial opinions is sufficient
to answer a legal question, or whether to follow a citation to another opinion.

Return ONLY JSON:
{
  "sufficient": <bool>,
  "reasoning": "<one or two sentences>",
  "follow": [{"case_id": "<id from the AVAILABLE list>", "why": "<short>"}]
}

Follow a citation only when the retrieved opinions turn on a precedent you have NOT
been given the text of, and that precedent is in the AVAILABLE list. Prefer stopping.
An answer grounded in fewer, directly relevant opinions beats one padded with
tangential authority. Return an empty "follow" when sufficient is true.`;

export interface Assessment {
  sufficient: boolean;
  reasoning: string;
  follow: { case_id: string; why: string }[];
}

// ---------- synthesis ----------

const SYNTH_SYSTEM = `You are a legal research assistant answering questions about U.S.
copyright and fair use, grounded ONLY in the opinions provided.

Rules:
- Ground every proposition in a provided opinion and cite it inline as [case_name].
- If the provided opinions do not answer the question, say so plainly. Never fill a
  gap from background knowledge.
- When opinions conflict, SAY SO and give both sides. Courts genuinely disagree —
  Bartz and Kadrey were decided two days apart and reason oppositely on market harm.
  Flattening that disagreement into one answer is the main failure mode here.
- Distinguish binding from persuasive authority when it matters. A district court
  decision does not bind another district.
- Do not quote more than a short phrase; paraphrase.
- Be concise. A well-organised four to eight sentence answer beats an essay.`;

function contextBlock(index: Index, hits: Hit[]): string {
  return hits
    .map((h) => {
      const c = index.chunks[h.idx];
      const court = `${c.court_level} court (${c.court}), ${c.year}`;
      const sec = c.section ? ` — ${c.section}` : "";
      return `### ${c.case_name} [${c.case_id}] — ${court}${sec}\n${c.text}`;
    })
    .join("\n\n");
}

export interface RunOptions {
  maxHops?: number;
}

export async function run(question: string, emit: Emit, opts: RunOptions = {}): Promise<void> {
  const maxHops = opts.maxHops ?? MAX_HOPS;
  const t0 = Date.now();
  const index = loadIndex();

  // 1. analyze
  const analysis = await stage(emit, "analyze", 0, "Analysing the question", () =>
    askJson<Analysis>(ANALYZE_SYSTEM, question),
  );
  emit({ type: "analysis", ...analysis });

  // 2. transform (HyDE + multi-query) — disabled; see USE_HYDE above.
  let tf: Transform = { hyde: "", variants: [] };
  if (USE_HYDE) {
    tf = await stage(emit, "transform", 0, "Writing a hypothetical opinion", () =>
      askJson<Transform>(HYDE_SYSTEM, question),
    );
    emit({ type: "transform", hyde: tf.hyde, variants: tf.variants ?? [] });
  }

  const collected = new Map<number, Hit>();
  const seenCases = new Set<string>();
  let hop = 0;
  let query = question;

  for (; hop <= maxHops; hop++) {
    // 3a. sparse — the ablation found BM25 alone outperforms dense alone here
    const probe =
      USE_HYDE && hop === 0
        ? `${query}\n${tf.hyde}\n${(tf.variants ?? []).join("\n")}`
        : query;
    const sparse = await stage(
      emit, "retrieve_sparse", hop, "BM25 over the corpus",
      () => index.bm25(probe, CANDIDATES),
      (r) => ({ docs: toDocs(index, r) }),
    );

    // 3b. dense
    const dense = await stage(
      emit, "retrieve_dense", hop, "Dense vector search",
      async () => index.dense(await embedQuery(probe, index.dims), CANDIDATES),
      (r) => ({ docs: toDocs(index, r) }),
    );

    // 4. fuse
    let fused = await stage(
      emit, "fuse", hop, "Reciprocal rank fusion",
      () => rrf([sparse, dense], 60, CANDIDATES * 2),
      (r) => ({ docs: toDocs(index, r, sparse) }),
    );

    // 5. temporal filter — the only stage that prevents anachronism
    if (analysis.as_of) {
      const before = fused.length;
      fused = await stage(
        emit, "temporal", hop, `Excluding opinions after ${analysis.as_of}`,
        () => asOfFilter(index, fused, analysis.as_of!),
        (r) => ({ docs: toDocs(index, r), detail: { dropped: before - r.length } }),
      );
    }

    // 6. cross-encoder rerank
    const reranked = await stage(
      emit, "rerank", hop, "Cross-encoder rerank",
      () => rerank(index, query, fused, Math.min(TOP * 4, fused.length)),
      (r) => ({ docs: toDocs(index, r, fused) }),
    );

    // 7. diversify AFTER rerank — reranking picks top-N chunks, which
    //    re-concentrates onto few cases and undoes an earlier diversify pass
    const picked = await stage(
      emit, "diversify", hop, `Capping ${PER_CASE} passages per case`,
      () => diversify(index, reranked, PER_CASE, TOP),
      (r) => ({ docs: toDocs(index, r, reranked) }),
    );

    for (const h of picked) collected.set(h.idx, h);
    for (const h of picked) seenCases.add(index.chunks[h.idx].case_id);

    if (hop === maxHops) break;

    // 8. assess — enough, or follow a citation?
    const available = citedBy([...seenCases], seenCases).slice(0, 8);
    if (available.length === 0) break;

    const nameOf = new Map(index.chunks.map((c) => [c.case_id, c.case_name]));
    const assessment = await stage(
      emit, "assess", hop, "Deciding whether to follow a citation",
      () =>
        askJson<Assessment>(
          ASSESS_SYSTEM,
          `QUESTION: ${question}\n\nRETRIEVED OPINIONS:\n${[...seenCases]
            .map((c) => `- ${nameOf.get(c) ?? c} [${c}]`)
            .join("\n")}\n\nAVAILABLE VIA CITATION:\n${available
            .map((e) => `- ${nameOf.get(e.target) ?? e.target} [${e.target}] (cited ${e.weight}x)`)
            .join("\n")}`,
        ),
      (r) => ({ detail: { sufficient: r.sufficient, follow: r.follow?.length ?? 0 } }),
    );

    const follow = (assessment.follow ?? []).filter((f) => !seenCases.has(f.case_id));
    emit({
      type: "assessment",
      hop,
      sufficient: assessment.sufficient,
      reasoning: assessment.reasoning,
      follow: follow.map((f) => ({
        case_id: f.case_id,
        case_name: nameOf.get(f.case_id) ?? f.case_id,
        why: f.why,
      })),
    });

    if (assessment.sufficient || follow.length === 0) break;

    // 9. hop — retrieve the followed precedent by name, so the next loop is scoped to it
    const target = follow[0];
    await stage(
      emit, "hop", hop, `Following citation to ${nameOf.get(target.case_id) ?? target.case_id}`,
      () => Promise.resolve(target),
      () => ({ detail: { case_id: target.case_id, why: target.why } }),
    );
    query = `${question} ${nameOf.get(target.case_id) ?? ""} ${target.why}`;
  }

  // 10. synthesize
  const finalHits = [...collected.values()].sort((a, b) => b.score - a.score).slice(0, 14);
  emit({ type: "stage_start", stage: "synthesize", hop, label: "Writing the answer" });
  const tSynth = Date.now();

  let usage: { input: number; output: number } | undefined;
  for await (const part of streamText(
    SYNTH_SYSTEM,
    `QUESTION: ${question}\n\nOPINIONS:\n\n${contextBlock(index, finalHits)}`,
  )) {
    if (part.text) emit({ type: "text", content: part.text });
    if (part.usage) usage = part.usage;
  }
  emit({ type: "stage_end", stage: "synthesize", hop, ms: Date.now() - tSynth });

  const cases = new Map<string, { case_id: string; case_name: string; citation: string | null }>();
  for (const h of finalHits) {
    const c = index.chunks[h.idx];
    cases.set(c.case_id, { case_id: c.case_id, case_name: c.case_name, citation: c.citation });
  }
  emit({ type: "citations", cases: [...cases.values()] });
  emit({
    type: "meta",
    total_ms: Date.now() - t0,
    hops: hop,
    input_tokens: usage?.input,
    output_tokens: usage?.output,
  });
  emit({ type: "done" });
}
