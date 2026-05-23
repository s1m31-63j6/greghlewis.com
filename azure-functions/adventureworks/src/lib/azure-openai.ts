// Azure OpenAI client — Managed Identity auth, JSON-mode output.
//
// The Function's system-assigned MI is granted "Cognitive Services
// OpenAI User" on the AOAI resource (see openai-rbac.bicep). We exchange
// the MI for a bearer token against the cognitiveservices scope, then
// pass it to the official openai package as the apiKey-shaped argument.

import { DefaultAzureCredential } from "@azure/identity";
import OpenAI from "openai";

const credential = new DefaultAzureCredential();
const SCOPE = "https://cognitiveservices.azure.com/.default";

// Token caching — these last ~1h. Refresh proactively at 80% lifetime.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;
  const tk = await credential.getToken(SCOPE);
  if (!tk) throw new Error("Failed to acquire Azure OpenAI token");
  cachedToken = {
    token: tk.token,
    expiresAt: tk.expiresOnTimestamp,
  };
  return tk.token;
}

async function client(): Promise<OpenAI> {
  const endpoint = process.env.AW_OPENAI_ENDPOINT;
  const deployment = process.env.AW_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AW_OPENAI_API_VERSION ?? "2024-10-21";
  if (!endpoint || !deployment) {
    throw new Error("AW_OPENAI_ENDPOINT and AW_OPENAI_DEPLOYMENT must be set");
  }
  const token = await getToken();
  return new OpenAI({
    apiKey: token,
    baseURL: `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { Authorization: `Bearer ${token}` },
  });
}

export interface AOAICompletion {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
  latency_ms: number;
}

export async function completeJson(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<AOAICompletion> {
  const c = await client();
  const start = Date.now();
  const r = await c.chat.completions.create({
    model: process.env.AW_OPENAI_DEPLOYMENT ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 1500,
  });
  const latency = Date.now() - start;
  const choice = r.choices[0];
  return {
    content: choice?.message?.content ?? "",
    prompt_tokens: r.usage?.prompt_tokens ?? 0,
    completion_tokens: r.usage?.completion_tokens ?? 0,
    model: r.model ?? process.env.AW_OPENAI_DEPLOYMENT ?? "gpt-4o-mini",
    latency_ms: latency,
  };
}

// Cost estimate for gpt-4o-mini (as of 2026-05):
//   $0.15 / 1M input tokens, $0.60 / 1M output tokens.
export function aoaiCostEstimate(prompt: number, completion: number): number {
  return (prompt / 1_000_000) * 0.15 + (completion / 1_000_000) * 0.6;
}
