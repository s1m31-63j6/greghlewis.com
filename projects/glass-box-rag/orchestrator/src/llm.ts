/**
 * Claude calls via Bedrock.
 *
 * Uses Converse / ConverseStream rather than InvokeModel: the Religious Voices
 * build established that InvokeModelWithResponseStream silently fails to engage
 * Bedrock prompt caching, while ConverseStream does.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ACCOUNT = process.env.GBRAG_AWS_ACCOUNT;
const MODEL_ID = process.env.GBRAG_MODEL ?? "us.anthropic.claude-sonnet-4-6";

let _client: BedrockRuntimeClient | undefined;
function client(): BedrockRuntimeClient {
  _client ??= new BedrockRuntimeClient({ region: REGION });
  return _client;
}

export function modelArn(): string {
  if (!ACCOUNT) throw new Error("GBRAG_AWS_ACCOUNT is required for the inference profile ARN");
  return `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`;
}

/** One-shot call that must return JSON. Used for the analyze and assess steps. */
export async function askJson<T>(
  system: string,
  user: string,
  maxTokens = 700,
): Promise<T> {
  const r = await client().send(
    new ConverseCommand({
      modelId: modelArn(),
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }] as Message[],
      inferenceConfig: { maxTokens, temperature: 0 },
    }),
  );
  const text = r.output?.message?.content?.[0]?.text ?? "";
  return parseJson<T>(text);
}

/**
 * Models wrap JSON in prose or fences often enough that this is worth doing
 * properly rather than trusting a bare JSON.parse.
 */
export function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in model output: ${text.slice(0, 160)}`);
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new Error(`unterminated JSON in model output: ${text.slice(0, 160)}`);
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

export async function* streamText(
  system: string,
  user: string,
  maxTokens = 1400,
): AsyncGenerator<{ text?: string; usage?: { input: number; output: number } }> {
  const r = await client().send(
    new ConverseStreamCommand({
      modelId: modelArn(),
      // cachePoint after the stable system block — the corpus-wide instructions
      // are identical on every request.
      system: [{ text: system }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content: [{ text: user }] }] as Message[],
      inferenceConfig: { maxTokens, temperature: 0.2 },
    }),
  );
  for await (const ev of r.stream ?? []) {
    const delta = ev.contentBlockDelta?.delta?.text;
    if (delta) yield { text: delta };
    const u = ev.metadata?.usage;
    if (u) yield { usage: { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0 } };
  }
}
