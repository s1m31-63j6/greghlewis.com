// Bedrock ConverseStream wrapper with prompt caching.
//
// Why ConverseStream and not InvokeModelWithResponseStream:
//   IMWRS silently fails to engage prompt caching on Bedrock (empirical
//   finding from the v1 implementation; documented in project memory).
//   ConverseStream's `cachePoint` system blocks DO engage the cache, and
//   our per-leader prompt is big enough that turn-2 cache reads cut the
//   input token bill roughly in half. The NFL chat accepts the no-cache
//   cost because its system prompt is small; ours can't.
//
// Yields async iterator events that the API route serializes to SSE.

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { STABLE_BLOCK, buildLeaderBlock, buildUserMessage, type RetrievedPassage } from "./persona";
import type { ChatStreamEvent, ChatTurn, Leader } from "./types";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ACCOUNT = process.env.RELIGIOUS_VOICES_AWS_ACCOUNT ?? process.env.NFLCOMPARABLES_AWS_ACCOUNT;
const MODEL_ID = process.env.RELIGIOUS_VOICES_MODEL ?? "us.anthropic.claude-sonnet-4-6";

let _client: BedrockRuntimeClient | null = null;

function client(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: REGION,
      credentials: process.env.AWS_PROFILE
        ? fromIni({ profile: process.env.AWS_PROFILE })
        : fromNodeProviderChain(),
    });
  }
  return _client;
}

function modelArn(): string {
  // Cross-region inference profile ARN (same pattern as NFL chat). The
  // SSR Lambda's IAM role must have bedrock:InvokeModelWithResponseStream
  // permission on this profile.
  if (!ACCOUNT) {
    throw new Error(
      "Bedrock account id missing: set RELIGIOUS_VOICES_AWS_ACCOUNT (or NFLCOMPARABLES_AWS_ACCOUNT).",
    );
  }
  return `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`;
}

export async function* chatStream(
  leader: Leader,
  query: string,
  retrieved: RetrievedPassage[],
  history: ChatTurn[] = [],
): AsyncGenerator<ChatStreamEvent> {
  // Two cache breakpoints: STABLE alone (shared across leaders), then
  // STABLE+leader (specific to this leader's session).
  const system: SystemContentBlock[] = [
    { text: STABLE_BLOCK },
    { cachePoint: { type: "default" } },
    { text: buildLeaderBlock(leader) },
    { cachePoint: { type: "default" } },
  ];

  const messages = [
    ...history.map((t) => ({
      role: t.role,
      content: [{ text: t.content }],
    })),
    {
      role: "user" as const,
      content: [{ text: buildUserMessage(query, retrieved) }],
    },
  ];

  const cmd = new ConverseStreamCommand({
    modelId: modelArn(),
    system,
    messages,
    inferenceConfig: { maxTokens: 600, temperature: 0.7 },
  });

  const resp = await client().send(cmd);
  if (!resp.stream) return;

  for await (const event of resp.stream) {
    if (event.contentBlockDelta?.delta?.text) {
      yield { type: "text", content: event.contentBlockDelta.delta.text };
    } else if (event.metadata?.usage) {
      const u = event.metadata.usage;
      yield {
        type: "done",
        usage: {
          input_tokens: u.inputTokens,
          output_tokens: u.outputTokens,
          cache_read_input_tokens: u.cacheReadInputTokens,
          cache_creation_input_tokens: u.cacheWriteInputTokens,
        },
      };
    }
  }
}
