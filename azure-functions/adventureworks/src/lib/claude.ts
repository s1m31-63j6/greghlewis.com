// Anthropic Claude client — key fetched from Key Vault on cold start
// and cached for the lifetime of the Function instance.

import Anthropic from "@anthropic-ai/sdk";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();

let cachedClient: Anthropic | null = null;

async function fetchAnthropicKey(): Promise<string> {
  const vaultName = process.env.AW_KEY_VAULT_NAME;
  const secretName = process.env.AW_ANTHROPIC_KEY_SECRET ?? "anthropic-api-key";
  if (!vaultName) throw new Error("AW_KEY_VAULT_NAME not set");
  const kv = new SecretClient(`https://${vaultName}.vault.azure.net`, credential);
  const secret = await kv.getSecret(secretName);
  if (!secret.value) throw new Error(`Secret ${secretName} has no value`);
  return secret.value;
}

async function client(): Promise<Anthropic> {
  if (cachedClient) return cachedClient;
  const apiKey = await fetchAnthropicKey();
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface ClaudeCompletion {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
  latency_ms: number;
}

const MODEL_ID_MAP: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-opus-4-7": "claude-opus-4-7",
};

function resolveModelId(): string {
  const requested = process.env.AW_ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  return MODEL_ID_MAP[requested] ?? requested;
}

// Newer Claude models (Sonnet 4.6+) reject assistant-message prefill on
// the API. We lean entirely on the system-prompt instruction to emit
// pure JSON, and extract the first {...} block defensively if there's
// any incidental prose.
export async function completeJson(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<ClaudeCompletion> {
  const c = await client();
  const modelId = resolveModelId();
  const start = Date.now();
  const r = await c.messages.create({
    model: modelId,
    max_tokens: 1500,
    temperature: 0.1,
    system: `${systemPrompt}\n\nCRITICAL: Respond with a single JSON object only. No prose, no markdown fences, no commentary before or after. Your entire response must be parseable by JSON.parse() as-is.`,
    messages: [
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user" as const, content: userMessage },
    ],
  });
  const latency = Date.now() - start;
  const textBlocks = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlocks.map((b) => b.text).join("").trim();
  // Strip ```json fences if the model wraps the JSON despite the system prompt.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  // Take the first balanced JSON object if extra prose snuck in.
  const firstBrace = stripped.indexOf("{");
  const content = firstBrace >= 0 ? stripped.slice(firstBrace) : stripped;
  return {
    content,
    prompt_tokens: r.usage?.input_tokens ?? 0,
    completion_tokens: r.usage?.output_tokens ?? 0,
    model: modelId,
    latency_ms: latency,
  };
}

// Cost estimate for Claude Sonnet 4.6 (as of 2026-05):
//   $3 / 1M input, $15 / 1M output. Adjust per model.
export function claudeCostEstimate(prompt: number, completion: number): number {
  return (prompt / 1_000_000) * 3 + (completion / 1_000_000) * 15;
}
