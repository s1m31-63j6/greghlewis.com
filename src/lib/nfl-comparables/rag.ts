// Bedrock KB RAG wrapper — TS port of the Python engine.rag.knowledge_base
// module. Same two-step Retrieve + Generate split: the Bedrock-managed
// RetrieveAndGenerate path either lets Sonnet quote licensed Brugler text
// verbatim (default template) or breaks citation parsing (custom template).
// We retrieve chunks ourselves, then synthesize with Sonnet 4.6 + the
// licensing-aware system prompt.

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type RetrievalFilter,
  type RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  find2026CompsFor,
  formatComps,
  formatCrossCohortMatches,
  summarizeClassMulti,
  topCompsForPlayer,
  type EngineComp,
} from "./engine-context";
import { extractMentions, lookupPlayer, resolveNames } from "./name-index";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const KB_ID = process.env.NFLCOMPARABLES_KB_ID;
const ACCOUNT = process.env.NFLCOMPARABLES_AWS_ACCOUNT;
const MODEL_ID = "us.anthropic.claude-sonnet-4-6";

// ScoutBot's identity + ground rules. The corpus is documented on the
// project's methodology page — the bot writes as a single editorial voice
// and does NOT volunteer source names in answers. Source tags arrive on
// each retrieved chunk for grounding; the bot uses them to verify claims,
// not to advertise them in the response.
const SYSTEM_PROMPT = `You are ScoutBot, an NFL draft-prospect analyst that synthesizes
pre-draft scouting reports (retrieved chunks, each tagged with its
source name) with the output of a quantitative comp engine, when
supplied. Follow these rules without exception:

1. Voice: write as a single editorial voice. Do NOT volunteer source
   names ("according to Brugler", "per Walter Football", etc.) in your
   answer. The website's methodology page documents which scouting
   outlets contribute. Only name a source if (a) the user explicitly
   asks who said something, or (b) two retrieved sources disagree and
   you need to attribute the disagreement.
2. Paraphrase. Never reproduce more than four consecutive words from any
   provided chunk. Treat all retrieved scouting text as licensed
   third-party material that must not be quoted verbatim.
3. Ground every factual claim in the retrieved chunks (or the engine
   context block, when provided). Do NOT add biographical details, school
   affiliations, teammate context, or stylistic comparisons that are not
   explicitly in the supplied material. Better to omit than to extrapolate.
4. If the retrieved chunks do not actually describe the prospect being
   asked about (e.g., a chunk only mentions the prospect in passing as a
   teammate of someone else), say "I don't have a scouting report on
   that prospect" and stop. Do not synthesize a profile from incidental
   mentions in other reports.
5. Keep answers SHORT. Hard targets:
   - Single-prospect question: 2-3 sentences. ~50 words.
   - Comparison: 4-5 sentences. ~80 words.
   - Class-level / aggregate question: ~80 words.
   The user gets a chat box, not an essay. They can ask a follow-up if
   they want more depth — every word past the target erodes the answer.
   Do not list bullet points, do not enumerate every retrieved chunk,
   do not restate the question, do not include throat-clearing intros.
6. Lead with the answer, not the framing. "Mendoza profiles as a
   mid-level NFL starter…" beats "Based on the scouting reports,
   Mendoza profiles as…".
7. When the engine context block is present, treat its top comparables
   as a second analytical lens. If the scouting outlook and the comp
   distribution agree, say so briefly. If they disagree, surface the
   tension honestly: "the scouting view is X, but the comp set leans Y —
   historically that profile has produced Z." Don't lecture about the
   model — name the pattern, not the methodology. You CAN refer to the
   "comp engine" by name when contrasting it with the scouting view —
   that's the project's analytical layer, not an external source.
8. Never reference the retrieved chunks by number, index, or position
   ("chunk [5]", "the third report", "the first source"). The bracketed
   numbers are an internal grounding mechanism the reader does not see.
   If you need to acknowledge a discrepancy in what was retrieved, do it
   in editorial prose ("one report appears to describe a different
   prospect with the same surname") without surfacing the numbering.`;

export interface RagChunk {
  text: string;
  sourceUri: string;
  sourceName: string;
  score: number;
  playerId?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ResolvedPlayer {
  playerId: string;
  name: string;
  position: string;
}

export interface RagResponse {
  answer: string;
  chunks: RagChunk[];
  // Players the retrieval was actually anchored on this turn (newly-resolved
  // names + carried-over pronoun context). Use this for viz zoom, NOT the
  // mention list — analyst comps the answer name in passing aren't the
  // subject of the question.
  subjectPlayerIds: string[];
  // Every player named in the answer text (subjects + analyst comps + side
  // mentions). Useful for follow-up suggestions but noisy for viz focus.
  mentionedPlayerIds: string[];
}

function credentials() {
  return process.env.AWS_PROFILE
    ? fromIni({ profile: process.env.AWS_PROFILE })
    : fromNodeProviderChain();
}

let _agentClient: BedrockAgentRuntimeClient | null = null;
let _runtimeClient: BedrockRuntimeClient | null = null;

function agentClient(): BedrockAgentRuntimeClient {
  if (!_agentClient) {
    _agentClient = new BedrockAgentRuntimeClient({
      region: REGION,
      credentials: credentials(),
    });
  }
  return _agentClient;
}

function runtimeClient(): BedrockRuntimeClient {
  if (!_runtimeClient) {
    _runtimeClient = new BedrockRuntimeClient({
      region: REGION,
      credentials: credentials(),
    });
  }
  return _runtimeClient;
}

function sourceName(uri: string): string {
  if (uri.includes("/corpus/brugler/")) return "Brugler";
  if (uri.includes("/corpus/walter_football/")) return "Walter Football";
  if (uri.includes("/corpus/wikipedia/")) return "Wikipedia";
  if (uri.includes("/corpus/recency/daniel_jeremiah/")) return "Daniel Jeremiah";
  if (uri.includes("/corpus/recency/lance_zierlein/")) return "Lance Zierlein";
  if (uri.includes("/corpus/recency/bucky_brooks/")) return "Bucky Brooks";
  if (uri.includes("/corpus/recency/rotoworld/")) return "Rotoworld";
  if (uri.includes("/corpus/recency/bleacher_report/")) return "Bleacher Report";
  if (uri.includes("/corpus/recency/espn/")) return "ESPN";
  if (uri.includes("/corpus/recency/cbs_renner/")) return "CBS Sports / Mike Renner";
  if (uri.includes("/corpus/recency/cbs_wilson/")) return "CBS Sports / Ryan Wilson";
  if (uri.includes("/corpus/recency/pfn/")) return "Pro Football Network";
  return "scouting report";
}

// Aurora SV2 (min ACU=0) takes ~30s to wake from auto-pause. Retry the
// transient "is resuming" errors instead of failing the request.
async function retrieveWithResumeRetry(
  query: string,
  filter: RetrievalFilter | undefined,
  numResults: number,
): Promise<RetrieveCommandOutput> {
  if (!KB_ID) throw new Error("NFLCOMPARABLES_KB_ID is not set");
  const cmd = new RetrieveCommand({
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: numResults,
        ...(filter ? { filter } : {}),
      },
    },
  });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await agentClient().send(cmd);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("is resuming") || msg.includes("is not currently available")) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("Bedrock Retrieve failed after retries");
}

function chunksFromResponse(resp: RetrieveCommandOutput): RagChunk[] {
  return (resp.retrievalResults ?? []).map((r) => {
    const uri = r.location?.s3Location?.uri ?? "";
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      text: r.content?.text ?? "",
      sourceUri: uri,
      sourceName: sourceName(uri),
      score: r.score ?? 0,
      playerId:
        typeof meta["player_id"] === "string"
          ? (meta["player_id"] as string)
          : undefined,
    };
  });
}

// Single per-player retrieve at higher numResults. The earlier per-source
// fan-out (12 sources × N players = 12-24 KB calls per turn) was crowding
// retrieval latency to 1.5-3s. One call per player returns the same total
// chunks but in ~200-400ms. We then enforce per-source diversification in
// post-processing so dense voices (Brugler/Wikipedia) don't crowd out
// shorter ones.
const PER_PLAYER_RESULTS = 14;
const PER_SOURCE_CAP = 2;

async function retrieveForPlayers(
  query: string,
  playerIds: string[],
): Promise<RagChunk[]> {
  const tasks = playerIds.map((pid) =>
    retrieveWithResumeRetry(
      query,
      { equals: { key: "player_id", value: pid } },
      PER_PLAYER_RESULTS,
    ),
  );
  const responses = await Promise.all(tasks);
  const allChunks = responses.flatMap(chunksFromResponse);
  // Per-source cap to preserve voice diversity. Sort by score within each
  // source so we keep the strongest matches when capping. Group keys
  // include playerId so the cap is per (player, source) — a comparison
  // query for two players still gets ~2 chunks per source per player.
  const byKey = new Map<string, RagChunk[]>();
  for (const c of allChunks) {
    const key = `${c.playerId ?? "unknown"}::${c.sourceName}`;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }
  const capped: RagChunk[] = [];
  for (const arr of byKey.values()) {
    arr.sort((a, b) => b.score - a.score);
    capped.push(...arr.slice(0, PER_SOURCE_CAP));
  }
  // Final sort by score so the LLM sees the most-relevant chunks first.
  capped.sort((a, b) => b.score - a.score);
  return capped;
}

function formatChunks(chunks: RagChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] Source: ${c.sourceName}\n${c.text.trim()}`)
    .join("\n\n");
}

function inferenceProfileArn(): string {
  if (!ACCOUNT) throw new Error("NFLCOMPARABLES_AWS_ACCOUNT is not set");
  return `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`;
}

interface GenerateOpts {
  history?: ChatTurn[];
  subjectNames?: string[];
  engineContext?: string;
}

// Build the InvokeModel body. Shared between non-streaming `generate` and
// streaming `generateStream` so the prompt structure stays in lockstep.
function buildInvokeBody(
  query: string,
  chunks: RagChunk[],
  opts: GenerateOpts,
): string {
  const { history = [], subjectNames = [], engineContext = "" } = opts;
  const subjectLine =
    subjectNames.length > 0
      ? `Subject prospect${subjectNames.length > 1 ? "s" : ""}: ${subjectNames.join(", ")}\n\n`
      : "";
  const engineBlock = engineContext ? `${engineContext}\n\n` : "";
  // The chunks block is omitted entirely when there are none (class-level
  // queries answer from structured engine context only). Otherwise the
  // bot would see "Retrieved scouting reports:\n\n" and start hedging
  // about empty material.
  const chunksBlock =
    chunks.length > 0
      ? `Retrieved scouting reports:\n${formatChunks(chunks)}\n\n`
      : "";
  const finalUserMsg =
    `${subjectLine}${engineBlock}Question: ${query}\n\n` +
    `${chunksBlock}` +
    `Answer:`;

  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: finalUserMsg },
  ];

  return JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    // Hard cap on answer length. Belt-and-suspenders backstop for the
    // prompt rule (#5). 220 tokens ≈ 140 words, enough for a tight
    // single-paragraph answer; the prompt's word targets are stricter.
    max_tokens: 220,
    system: SYSTEM_PROMPT,
    messages,
  });
}

export async function generate(
  query: string,
  chunks: RagChunk[],
  opts: GenerateOpts = {},
): Promise<string> {
  const cmd = new InvokeModelCommand({
    modelId: inferenceProfileArn(),
    body: buildInvokeBody(query, chunks, opts),
    contentType: "application/json",
  });
  const resp = await runtimeClient().send(cmd);
  const payload = JSON.parse(new TextDecoder().decode(resp.body));
  const blocks = (payload.content ?? []) as Array<{ type?: string; text?: string }>;
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

// Streaming version. Calls onDelta for each text chunk Bedrock emits. The
// returned promise resolves with the FULL answer text once the stream
// completes, so callers can still use the string for downstream work
// (mention extraction, etc.).
export async function generateStream(
  query: string,
  chunks: RagChunk[],
  opts: GenerateOpts,
  onDelta: (text: string) => void,
): Promise<string> {
  const cmd = new InvokeModelWithResponseStreamCommand({
    modelId: inferenceProfileArn(),
    body: buildInvokeBody(query, chunks, opts),
    contentType: "application/json",
  });
  const resp = await runtimeClient().send(cmd);
  let full = "";
  if (!resp.body) return full;
  for await (const event of resp.body) {
    if (!event.chunk?.bytes) continue;
    const decoded = new TextDecoder().decode(event.chunk.bytes);
    let payload: { type?: string; delta?: { type?: string; text?: string } };
    try {
      payload = JSON.parse(decoded);
    } catch {
      continue;
    }
    // Anthropic-on-Bedrock emits content_block_delta events for streamed
    // text; ignore the message_start / message_delta / message_stop frames.
    if (
      payload.type === "content_block_delta" &&
      payload.delta?.type === "text_delta" &&
      typeof payload.delta.text === "string"
    ) {
      full += payload.delta.text;
      onDelta(payload.delta.text);
    }
  }
  return full;
}

export interface ChatOpts {
  // Preferred: explicit player_id from the per-player chat surface.
  playerId?: string;
  playerName?: string;
  // Conversation context for multi-turn.
  history?: ChatTurn[];
  // Carry-over subject from previous turn so "his" resolves when the new
  // user query has no proper noun. Falls back when name resolution finds
  // nothing in the latest query.
  contextPlayerIds?: string[];
  numResults?: number;
}

// Detect "he / his / him / she / her / they / their" — when the user uses a
// pronoun in a follow-up, we should keep last turn's subjects in the
// retrieval anchor set even if they also named someone new this turn.
const PRONOUN_REGEX = /\b(he|him|his|she|her|hers|they|them|their|theirs)\b/i;
const MAX_SUBJECTS = 4;

function logTiming(label: string, t0: number): void {
  const ms = Math.round(performance.now() - t0);
  console.log(`[chat][timing] ${label}: ${ms}ms`);
}

// ----- Query intent detection -----
//
// Two non-default intents short-circuit the standard RAG-by-player path:
//
//  1. "find-style": user names a HISTORICAL player and wants the closest
//     2026 prospect ("find a Saquon-style runner", "who is the next X").
//     Default RAG-by-name routes to the historical player and answers
//     ABOUT them — wrong direction. We need to flip to their 2026 comps.
//
//  2. "class": user asks about a position group, draft year, or class as
//     an aggregate ("how does the 2026 WR class compare to 2025?", "tell
//     me about this draft's QBs"). Default unfiltered-RAG returns one
//     random scouting chunk; we need to compose a structured summary.
//
// Detection is intentionally conservative: false positives push a regular
// query into a fancy path that returns less detail. False negatives just
// fall back to the existing RAG flow, which still produces a reasonable
// answer for most named-player questions.

// Multiple alternatives — each tested independently. Avoiding a single
// big alternation wrapped in \b...\b because some matchers want a trailing
// \b (whole-word `find`, `next`) and some don't (`like Marvin` ends mid-name,
// not at a word boundary).
const FIND_STYLE_PATTERNS: RegExp[] = [
  /\bfind\b.*\b(in this draft|in the 202[0-9]|prospect)/i,  // explicit search
  /\b(who'?s|who is|which prospect)\b.*\b(next|like|comparable|similar|closest|resembl)/i,
  /\b(next|comp(s|arable)?\s+(in|for|to)|most like|closest to|resembl(es|ing)?|similar to)\b/i,
  /\bplays like\b/i,                       // "who plays like X"
  /-style\b|-like\b/i,                     // "Saquon-style", "Mahomes-like"
  /\bin this draft\b|\bin the 202[0-9]\b/i,  // contextual phrases
];

function matchesFindStyle(query: string): boolean {
  return FIND_STYLE_PATTERNS.some((re) => re.test(query));
}

const CLASS_KEYWORDS =
  /\b(class(es)?|cohorts?|crops?|groups?|waves?|wideouts?|quarterbacks?|tight ends?|running backs?)\b|\b(this|the|202[0-9]) (draft|class(es)?|cohorts?|year)\b/i;

const POSITION_KEYWORDS: Record<string, string> = {
  qb: "QB", quarterback: "QB", quarterbacks: "QB", qbs: "QB",
  rb: "RB", "running back": "RB", "running backs": "RB", runner: "RB", runners: "RB", rbs: "RB",
  wr: "WR", "wide receiver": "WR", "wide receivers": "WR", wideout: "WR", wideouts: "WR", receiver: "WR", receivers: "WR", wrs: "WR",
  te: "TE", "tight end": "TE", "tight ends": "TE", tes: "TE",
};

function detectPosition(query: string): string | null {
  const lc = query.toLowerCase();
  // Check multi-word phrases first so "running back" doesn't lose to "back"
  const sortedKeys = Object.keys(POSITION_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const k of sortedKeys) {
    if (new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`).test(lc)) {
      return POSITION_KEYWORDS[k];
    }
  }
  return null;
}

interface DetectedIntent {
  type: "regular" | "find_style" | "class";
  // For class queries: which classes to summarize. Plural to support
  // year-over-year comparisons ("2026 WR class vs 2025"). Position is
  // shared across years — we don't currently support comparing 2026 WR
  // class to 2025 QB class (would need pair-of-scopes).
  classScope?: { years: number[]; position: string | null };
}

function detectIntent(
  query: string,
  resolvedHistoricalPlayer: { name: string; cohort: string } | null,
): DetectedIntent {
  const position = detectPosition(query);
  const yearMatches = Array.from(
    query.matchAll(/\b(20(?:1[4-9]|2[0-9]))\b/g),
  ).map((m) => parseInt(m[1], 10));

  // Class intent: explicit class keyword OR implicit year+position pattern.
  // Implicit form catches "most physical RB in 2026" or "best WR this draft"
  // without forcing the user to literally say "class".
  const explicitClass = CLASS_KEYWORDS.test(query);
  const implicitClass =
    !resolvedHistoricalPlayer &&
    position !== null &&
    (yearMatches.length > 0 ||
      /\b(this|the)\s+(draft|class|cohort|year)\b/i.test(query));
  if (!resolvedHistoricalPlayer && (explicitClass || implicitClass)) {
    const years = yearMatches.length > 0
      ? Array.from(new Set(yearMatches)).sort((a, b) => b - a)
      : [2026];
    return {
      type: "class",
      classScope: { years, position },
    };
  }
  if (
    resolvedHistoricalPlayer &&
    resolvedHistoricalPlayer.cohort !== "prediction_2026" &&
    matchesFindStyle(query)
  ) {
    return { type: "find_style" };
  }
  return { type: "regular" };
}

// Shared prep work for the chat path: subject resolution, retrieval, and
// engine-comp context block. Both `chat` (non-streaming) and `chatStream`
// call this; only the LLM-generation step differs between them.
interface ChatPrep {
  subjectIds: string[];
  subjectNames: string[];
  chunks: RagChunk[];
  engineContext: string;
}

async function prepareChat(
  query: string,
  opts: ChatOpts,
  tStart: number,
): Promise<ChatPrep> {
  const { playerId, playerName, contextPlayerIds = [] } = opts;
  const unfilteredResults = opts.numResults ?? 6;

  let subjectIds: string[] = [];
  let subjectNames: string[] = [];
  // Reference player for find-style intent: stash the originally-resolved
  // historical player so we can flip subjectIds to their 2026 comps.
  let referencePlayer: { id: string; name: string; cohort: string } | null = null;

  if (playerId) {
    subjectIds = [playerId];
    if (playerName) subjectNames = [playerName];
    else {
      const p = await lookupPlayer(playerId);
      if (p) subjectNames = [p.name];
    }
  } else {
    const resolved = await resolveNames(query);
    const newIds = resolved.groups.flatMap((g) =>
      g.candidates.map((c) => c.playerId),
    );
    const newNames = resolved.groups.map((g) => g.primary.name);
    const hasPronoun = PRONOUN_REGEX.test(query);

    // Stash the FIRST resolved player + cohort for intent detection.
    if (resolved.groups.length > 0) {
      const first = resolved.groups[0].primary;
      referencePlayer = { id: first.playerId, name: first.name, cohort: first.cohort };
    }

    if (newIds.length > 0 && hasPronoun && contextPlayerIds.length > 0) {
      subjectIds = Array.from(new Set([...newIds, ...contextPlayerIds])).slice(0, MAX_SUBJECTS);
      const ctxPlayers = await Promise.all(contextPlayerIds.map(lookupPlayer));
      const ctxNames = ctxPlayers
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => p.name);
      subjectNames = Array.from(new Set([...newNames, ...ctxNames])).slice(0, MAX_SUBJECTS);
    } else if (newIds.length > 0) {
      subjectIds = newIds.slice(0, MAX_SUBJECTS);
      subjectNames = newNames.slice(0, MAX_SUBJECTS);
    } else if (contextPlayerIds.length > 0) {
      subjectIds = contextPlayerIds.slice(0, MAX_SUBJECTS);
      const players = await Promise.all(subjectIds.map(lookupPlayer));
      subjectNames = players
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => p.name);
    }
  }

  const tResolve = performance.now();
  logTiming("resolve", tStart);

  // Intent detection on the resolved-but-uncommitted state. If find-style
  // fires, we replace subjectIds with the 2026 matches BEFORE retrieval —
  // so the chunks that come back describe the prospects we actually want
  // to talk about (not the historical reference player). Per-player chat
  // (explicit playerId from the side panel) never re-intents — the panel
  // pinned the subject and the user expects answers about that prospect.
  const intent: DetectedIntent = playerId
    ? { type: "regular" }
    : detectIntent(query, referencePlayer);
  console.log(`[chat][intent] type=${intent.type}${intent.classScope ? ` scope=${JSON.stringify(intent.classScope)}` : ""}${referencePlayer ? ` ref=${referencePlayer.name}` : ""}`);

  let preEngineBlock = "";
  if (intent.type === "find_style" && referencePlayer) {
    const matches = await find2026CompsFor(referencePlayer.id, 4);
    preEngineBlock = formatCrossCohortMatches(referencePlayer.name, matches);
    if (matches.length > 0) {
      // Re-anchor RAG retrieval on the 2026 matches so the chunks we
      // bring back describe THEM, not the historical reference player.
      subjectIds = matches.map((m) => m.id).slice(0, MAX_SUBJECTS);
      subjectNames = matches.map((m) => m.name).slice(0, MAX_SUBJECTS);
    } else {
      // No comps found in the engine — keep the reference as subject
      // so the bot can at least describe their archetype, then explain
      // nothing in 2026 matches via the engine context block.
      subjectIds = [referencePlayer.id];
      subjectNames = [referencePlayer.name];
    }
  } else if (intent.type === "class") {
    // Class queries don't anchor on any player; we replace the chunk
    // payload with a structured class summary in the engine context.
    // Multi-year detected from the query so "2026 WR vs 2025" gets both
    // class blocks side by side.
    subjectIds = [];
    subjectNames = [];
    const years = intent.classScope?.years ?? [2026];
    const position = intent.classScope?.position ?? null;
    preEngineBlock = await summarizeClassMulti(years, position);
  }

  let chunks: RagChunk[];
  if (subjectIds.length > 0) {
    chunks = await retrieveForPlayers(query, subjectIds);
  } else if (intent.type === "class") {
    // Skip RAG entirely for class queries — the structured summary is
    // the answer. A retrieval at this point would just pull one random
    // player's chunks and bias the synthesis toward them.
    chunks = [];
  } else {
    const resp = await retrieveWithResumeRetry(query, undefined, unfilteredResults);
    chunks = chunksFromResponse(resp);
  }
  logTiming(`retrieve (${chunks.length} chunks, ${subjectIds.length} subjects, intent=${intent.type})`, tResolve);
  const tRetrieve = performance.now();

  const engineCompBlocks: string[] = [];
  if (preEngineBlock) engineCompBlocks.push(preEngineBlock);
  // Skip the per-subject "top comparables" block for find-style — the
  // cross-cohort block already covers what the bot needs to know, and
  // adding 4 subjects' worth of comp lists would blow up the prompt.
  if (intent.type !== "find_style" && intent.type !== "class") {
    for (const [i, sid] of subjectIds.slice(0, 2).entries()) {
      const comps: EngineComp[] = await topCompsForPlayer(sid, 5);
      const name = subjectNames[i] ?? sid;
      const block = formatComps(name, comps);
      if (block) engineCompBlocks.push(block);
    }
  }
  const engineContext = engineCompBlocks.join("\n\n");
  logTiming("engine-comps", tRetrieve);

  return { subjectIds, subjectNames, chunks, engineContext };
}

// SSE event payloads sent by the streaming endpoint. The `meta` event
// arrives once before any text; `text` events stream the answer as it's
// generated; `done` arrives once when synthesis completes.
export type ChatStreamEvent =
  | { type: "meta"; sources: string[]; subjectPlayerIds: string[] }
  | { type: "text"; content: string }
  | { type: "done"; mentionedPlayerIds: string[] }
  | { type: "error"; message: string };

// Streaming variant of `chat`. Returns a Response whose body is an SSE
// stream of ChatStreamEvent JSON objects (one per `data: ...` line). The
// client can read the body as a ReadableStream and update the UI as
// each text delta arrives — perceived latency drops from ~10s to ~1s
// because the user sees the first words almost immediately.
export function chatStreamResponse(query: string, opts: ChatOpts = {}): Response {
  const tStart = performance.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const { subjectIds, subjectNames, chunks, engineContext } =
          await prepareChat(query, opts, tStart);

        const sources = Array.from(new Set(chunks.map((c) => c.sourceName)));
        send({ type: "meta", sources, subjectPlayerIds: subjectIds });

        if (chunks.length === 0 && !engineContext) {
          send({ type: "text", content: "I don't have a scouting report on that prospect." });
          send({ type: "done", mentionedPlayerIds: [] });
          controller.close();
          return;
        }

        const tGen = performance.now();
        const full = await generateStream(
          query,
          chunks,
          {
            history: opts.history ?? [],
            subjectNames,
            engineContext,
          },
          (delta) => send({ type: "text", content: delta }),
        );
        logTiming(`generate-stream (${full.length} chars)`, tGen);

        const extracted = await extractMentions(full);
        const mentionedPlayerIds = Array.from(new Set([...subjectIds, ...extracted]));
        send({ type: "done", mentionedPlayerIds });
        logTiming("TOTAL (stream)", tStart);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[chat][stream] failed:", message);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevents proxy buffering; some hosts (nginx/Cloudfront) buffer
      // SSE by default and the user wouldn't see streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

// Non-streaming variant; kept for completeness and any callers that need
// the full response in one shot. The streaming endpoint is preferred for
// the chat UI — it cuts perceived latency from ~10s to ~1s. This wrapper
// just runs prepareChat + non-streaming generate in sequence.
export async function chat(query: string, opts: ChatOpts = {}): Promise<RagResponse> {
  const tStart = performance.now();
  const { subjectIds, subjectNames, chunks, engineContext } = await prepareChat(query, opts, tStart);

  // Class-level queries legitimately have zero chunks — they synthesize
  // from the engine context summary instead. Only short-circuit when we
  // also have no engine context (genuinely empty retrieval).
  if (chunks.length === 0 && !engineContext) {
    return {
      answer: "I don't have a scouting report on that prospect.",
      chunks: [],
      subjectPlayerIds: subjectIds,
      mentionedPlayerIds: [],
    };
  }

  const tEngine = performance.now();
  const answer = await generate(query, chunks, {
    history: opts.history ?? [],
    subjectNames,
    engineContext,
  });
  logTiming(`generate (${answer.length} chars)`, tEngine);

  const extracted = await extractMentions(answer);
  const mentionedPlayerIds = Array.from(new Set([...subjectIds, ...extracted]));
  logTiming("TOTAL", tStart);

  return { answer, chunks, subjectPlayerIds: subjectIds, mentionedPlayerIds };
}
