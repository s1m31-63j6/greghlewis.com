// Bedrock Converse streaming + prompt caching for the religious-voices chat.
//
// Why ConverseStream and not InvokeModelWithResponseStream:
//   The legacy InvokeModelWithResponseStream API on Bedrock does NOT
//   engage prompt caching, regardless of `cache_control` placement. Cache
//   writes silently come back as 0. The Converse API uses an explicit
//   `cachePoint` content block instead of an attribute-style marker, and
//   DOES cache properly when streaming. (Verified against Sonnet 4.6 in
//   us-east-1: a 2000-token prefix shows cacheWriteInputTokens > 0 on
//   the first call and cacheReadInputTokens > 0 on the second.)
//
// Architectural difference from the NFL chat:
//   - No Bedrock Knowledge Base. Retrieval runs in-process against a
//     local corpus.json (zero idle cost vs. Aurora SV2 under the NFL KB).
//   - Prompt caching engaged from day one.

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlockDeltaEvent,
  type ConverseStreamMetadataEvent,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { buildSystemContent } from "./persona";
import { retrieveForLeader, type RetrievedChunk } from "./retrieval";
import type { Leader } from "./types";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ACCOUNT = process.env.RELIGIOUS_VOICES_AWS_ACCOUNT ?? process.env.NFLCOMPARABLES_AWS_ACCOUNT;
const MODEL_ID = "us.anthropic.claude-sonnet-4-6";

function credentials() {
  return process.env.AWS_PROFILE
    ? fromIni({ profile: process.env.AWS_PROFILE })
    : fromNodeProviderChain();
}

let _runtimeClient: BedrockRuntimeClient | null = null;
function runtimeClient(): BedrockRuntimeClient {
  if (!_runtimeClient) {
    _runtimeClient = new BedrockRuntimeClient({
      region: REGION,
      credentials: credentials(),
    });
  }
  return _runtimeClient;
}

function inferenceProfileArn(): string {
  if (!ACCOUNT) {
    throw new Error(
      "RELIGIOUS_VOICES_AWS_ACCOUNT (or NFLCOMPARABLES_AWS_ACCOUNT) is not set",
    );
  }
  return `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  leader: Leader;
  history?: ChatTurn[];
}

export interface SourceAttribution {
  work_title: string;
  year: number | null;
  source_url: string;
}

export type ChatStreamEvent =
  | { type: "meta"; sources: SourceAttribution[] }
  | { type: "text"; content: string }
  | {
      type: "done";
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadInputTokens?: number;
        cacheWriteInputTokens?: number;
      };
    }
  | { type: "error"; message: string };

function dedupeSources(chunks: RetrievedChunk[]): SourceAttribution[] {
  const seen = new Set<string>();
  const out: SourceAttribution[] = [];
  for (const r of chunks) {
    const key = `${r.chunk.work_title}::${r.chunk.year ?? ""}::${r.chunk.source_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      work_title: r.chunk.work_title,
      year: r.chunk.year,
      source_url: r.chunk.source_url,
    });
  }
  return out;
}

// Note on prompt caching mechanics (empirically verified Sonnet 4.6 on
// Bedrock): the minimum cacheable prefix is ~2100 tokens, NOT the 1024
// tokens documented for Claude 3.5/3.7. Block 1 of the system prompt has
// been written deliberately past this threshold so the cache engages from
// the first turn. If you trim STABLE_BLOCK in persona.ts and cache hit
// rate drops, this is the cause — re-measure with tiktoken and re-pad.
function buildUserMessageText(query: string, retrieved: RetrievedChunk[]): string {
  const passages = retrieved.length
    ? retrieved
        .map((r, i) => {
          const yearStr = r.chunk.year ? `, ${r.chunk.year}` : "";
          return `[${i + 1}] ${r.chunk.work_title}${yearStr}\n${r.chunk.text.trim()}`;
        })
        .join("\n\n")
    : "(no passages retrieved — answer entirely in <extrapolation> tags, briefly)";

  return `SOURCE PASSAGES (this leader's own published words):

${passages}

VISITOR QUESTION:
${query}

Answer in this leader's voice, following the tagging rules. Begin
immediately — no preamble.`;
}

export function chatStreamResponse(query: string, opts: ChatOpts): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const retrieved = await retrieveForLeader(query, opts.leader.leader_id, 8);
        send({ type: "meta", sources: dedupeSources(retrieved) });

        const userText = buildUserMessageText(query, retrieved);
        const messages = [
          ...(opts.history ?? []).map((t) => ({
            role: t.role,
            content: [{ text: t.content }],
          })),
          { role: "user" as const, content: [{ text: userText }] },
        ];

        const cmd = new ConverseStreamCommand({
          modelId: inferenceProfileArn(),
          system: buildSystemContent(opts.leader),
          messages,
          inferenceConfig: { maxTokens: 600, temperature: 0.7 },
        });

        const resp = await runtimeClient().send(cmd);
        if (!resp.stream) {
          send({ type: "done" });
          return;
        }

        let usage: ChatStreamEvent extends { type: "done"; usage?: infer U }
          ? U
          : undefined;
        for await (const event of resp.stream) {
          if (event.contentBlockDelta) {
            const delta = (event.contentBlockDelta as ContentBlockDeltaEvent).delta;
            if (delta && "text" in delta && typeof delta.text === "string") {
              send({ type: "text", content: delta.text });
            }
          } else if (event.metadata) {
            const meta = event.metadata as ConverseStreamMetadataEvent;
            if (meta.usage) {
              usage = {
                inputTokens: meta.usage.inputTokens,
                outputTokens: meta.usage.outputTokens,
                cacheReadInputTokens: meta.usage.cacheReadInputTokens,
                cacheWriteInputTokens: meta.usage.cacheWriteInputTokens,
              };
            }
          }
        }
        send({ type: "done", usage });
        if (usage) {
          console.log(
            `[religious-voices][usage] leader=${opts.leader.leader_id} ` +
              `input=${usage.inputTokens ?? 0} ` +
              `output=${usage.outputTokens ?? 0} ` +
              `cache_write=${usage.cacheWriteInputTokens ?? 0} ` +
              `cache_read=${usage.cacheReadInputTokens ?? 0}`,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[religious-voices][stream] failed:", message);
        send({ type: "error", message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
