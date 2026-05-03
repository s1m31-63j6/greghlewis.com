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
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { formatComps, topCompsForPlayer, type EngineComp } from "./engine-context";
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
5. Keep answers tight: ONE paragraph for a single-prospect question, at
   most TWO paragraphs for a comparison. Follow-ups build on the prior
   turn instead of repeating the full profile. If the user asks for more
   depth they can ask a follow-up — never volunteer a full essay.
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

// KB sidecars tag every chunk with `source`. We retrieve per source
// explicitly so each makes it into context — without this, the longer
// profiles (Brugler) outrank shorter sources on hybrid similarity and the
// answer attributes everything to one source. Add a source here AFTER
// the corresponding CDK data source is deployed and ingested.
const KB_SOURCES = [
  "brugler",
  "walter_football",
  "wikipedia",
  "daniel_jeremiah",
  "lance_zierlein",
  "bucky_brooks",
  "rotoworld",
  "pfn",
  "bleacher_report",
  "espn",
  "cbs_renner",
  "cbs_wilson",
] as const;

// Per-player retrieval guarantees each named prospect gets representation.
// Per-source diversification within each player guarantees Walter Football
// isn't crowded out of the budget by Brugler's denser profiles. For each
// (player, source) combo we retrieve `perSourceResults` chunks; empty when
// the source has no coverage of that player.
async function retrieveForPlayers(
  query: string,
  playerIds: string[],
  perSourceResults: number,
): Promise<RagChunk[]> {
  const tasks = playerIds.flatMap((pid) =>
    KB_SOURCES.map((source) =>
      retrieveWithResumeRetry(
        query,
        {
          andAll: [
            { equals: { key: "player_id", value: pid } },
            { equals: { key: "source", value: source } },
          ],
        },
        perSourceResults,
      ),
    ),
  );
  const responses = await Promise.all(tasks);
  return responses.flatMap(chunksFromResponse);
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

export async function generate(
  query: string,
  chunks: RagChunk[],
  opts: GenerateOpts = {},
): Promise<string> {
  const { history = [], subjectNames = [], engineContext = "" } = opts;
  const subjectLine =
    subjectNames.length > 0
      ? `Subject prospect${subjectNames.length > 1 ? "s" : ""}: ${subjectNames.join(", ")}\n\n`
      : "";
  const engineBlock = engineContext ? `${engineContext}\n\n` : "";
  // Retrieved chunks change every turn (we re-retrieve on each user message),
  // so they live in the latest user message rather than as a system suffix.
  const finalUserMsg =
    `${subjectLine}${engineBlock}Question: ${query}\n\n` +
    `Retrieved scouting reports:\n${formatChunks(chunks)}\n\n` +
    `Answer:`;

  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: finalUserMsg },
  ];

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    // Cap chat answers at ~1-2 paragraphs (300-400 words). Backstop for
    // when the prompt rule loses against deeply-relevant chunks.
    max_tokens: 420,
    system: SYSTEM_PROMPT,
    messages,
  });

  const cmd = new InvokeModelCommand({
    modelId: inferenceProfileArn(),
    body,
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

export async function chat(query: string, opts: ChatOpts = {}): Promise<RagResponse> {
  const { playerId, playerName, history = [], contextPlayerIds = [] } = opts;
  // 6 chunks is the historical default for unfiltered retrieval. For
  // per-player+per-source retrieval we ask for 3 chunks per (player, source)
  // pair — with 2 sources, that's up to 6 chunks per subject (~12 for a
  // two-player comparison). Empty source returns are fine; total stays
  // bounded by what the corpus actually contains.
  const perSourceResults = 3;
  const unfilteredResults = opts.numResults ?? 6;

  // 1. Compose the subject set that anchors retrieval this turn.
  let subjectIds: string[] = [];
  let subjectNames: string[] = [];

  if (playerId) {
    // Per-player chat surface — caller already knows the subject.
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

    if (newIds.length > 0 && hasPronoun && contextPlayerIds.length > 0) {
      // Mixed: new name(s) + pronoun referencing prior subject(s). Merge
      // both so cross-player comparisons retrieve from both prospects.
      subjectIds = Array.from(new Set([...newIds, ...contextPlayerIds])).slice(0, MAX_SUBJECTS);
      const ctxPlayers = await Promise.all(contextPlayerIds.map(lookupPlayer));
      const ctxNames = ctxPlayers
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => p.name);
      subjectNames = Array.from(new Set([...newNames, ...ctxNames])).slice(0, MAX_SUBJECTS);
    } else if (newIds.length > 0) {
      // New names only → user moved on, don't bleed in old context.
      subjectIds = newIds.slice(0, MAX_SUBJECTS);
      subjectNames = newNames.slice(0, MAX_SUBJECTS);
    } else if (contextPlayerIds.length > 0) {
      // Pronoun-only follow-up → reuse last turn's subjects.
      subjectIds = contextPlayerIds.slice(0, MAX_SUBJECTS);
      const players = await Promise.all(subjectIds.map(lookupPlayer));
      subjectNames = players
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => p.name);
    }
  }

  // 2. Retrieve chunks. Per-player+per-source when we have subjects;
  //    unfiltered hybrid when we don't (open-ended class-level questions).
  let chunks: RagChunk[];
  if (subjectIds.length > 0) {
    chunks = await retrieveForPlayers(query, subjectIds, perSourceResults);
  } else {
    const resp = await retrieveWithResumeRetry(query, undefined, unfilteredResults);
    chunks = chunksFromResponse(resp);
  }

  if (chunks.length === 0) {
    return {
      answer: "I don't have a scouting report on that prospect.",
      chunks: [],
      subjectPlayerIds: subjectIds,
      mentionedPlayerIds: [],
    };
  }

  // 3. Pull the engine's top comparables for each subject so synthesis can
  //    reconcile (or honestly disagree with) the scouting view. Capped at
  //    5 comps per subject and 2 subjects to keep the prompt compact.
  const engineCompBlocks: string[] = [];
  for (const [i, sid] of subjectIds.slice(0, 2).entries()) {
    const comps: EngineComp[] = await topCompsForPlayer(sid, 5);
    const name = subjectNames[i] ?? sid;
    const block = formatComps(name, comps);
    if (block) engineCompBlocks.push(block);
  }
  const engineContext = engineCompBlocks.join("\n\n");

  // 4. Synthesize against full message history.
  const answer = await generate(query, chunks, {
    history,
    subjectNames,
    engineContext,
  });

  // 5. Mention extraction over the answer (drives the "you might also like"
  // signal). Always include subjects so they're flagged even when the model
  // renders them with a possessive ("his archetype").
  const extracted = await extractMentions(answer);
  const mentionedPlayerIds = Array.from(new Set([...subjectIds, ...extracted]));

  return { answer, chunks, subjectPlayerIds: subjectIds, mentionedPlayerIds };
}
