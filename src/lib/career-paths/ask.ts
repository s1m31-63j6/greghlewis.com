// "Ask about this" for the funding brief: Bedrock ConverseStream with the
// whole brief pinned behind one cache point.
//
// Mirrors src/lib/religious-voices/chat.ts. The brief is small enough to
// ship as the system prompt in full, so there is no retrieval step; the
// model answers from the same text the reader has on screen and names the
// section it drew on. ConverseStream rather than InvokeModel because only
// ConverseStream's `cachePoint` engages Bedrock's prompt cache (see the
// religious-voices notes).

import fs from "node:fs";
import path from "node:path";

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";

import { BRIEF, FUNDING_TABLE, GLOSSARY, QUESTIONS_TO_ASK, STAGE_LADDER } from "./brief";

export type AskStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ACCOUNT = process.env.NFLCOMPARABLES_AWS_ACCOUNT;
const MODEL_ID = "us.anthropic.claude-sonnet-4-6";
const MAX_HISTORY = 6;
const MAX_QUESTION = 500;

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
  // Cross-region inference profile ARN. The Amplify compute role already
  // holds bedrock:InvokeModelWithResponseStream on this profile.
  if (!ACCOUNT) throw new Error("Bedrock account id missing: set NFLCOMPARABLES_AWS_ACCOUNT.");
  return `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`;
}

// ── System prompt ────────────────────────────────────────────────────

const RULES = `You answer reader questions about a short explainer titled "Stages and funding, explained", part of a page called "Should You Join a Startup?". The full text of the explainer (the brief) follows these rules.

Rules:
- Answer only from the brief. Do not bring in outside facts.
- When you draw on a section, name it in parentheses, for example "(see: How money reaches you)".
- If the question is outside startup funding, stages, or equity compensation, say so in one sentence and point to the nearest section.
- Never give personalized financial or tax advice. If asked "should I take this offer" or anything like it, restate what the brief says to check instead of answering yes or no.
- Plain prose, no headings, at most 120 words.
- No em dashes.
- At most three short bullet-like sentences if you need to list things; otherwise ordinary sentences.
- Do not invent numbers that are not in the brief. If the brief lacks a number, say so.`;

function mdTable(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "/")).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

function serializeBrief(): string {
  const parts: string[] = [];
  for (const s of BRIEF) {
    parts.push(`## ${s.heading}\n\n${s.paragraphs.join("\n\n")}`);
    if (s.id === "funding-models") {
      parts.push(mdTable(
        ["Model", "Who owns it", "What they want", "Horizon", "Cash pay", "Equity", "Liquidity", "Job risk", "Good outcome"],
        FUNDING_TABLE.map((r) => [r.model, r.owner, r.wants, r.horizon, r.cashPay, r.equity, r.liquidity, r.jobRisk, r.goodOutcome]),
      ));
    }
    if (s.id === "the-stage-ladder") {
      parts.push(mdTable(
        ["Stage", "Round size", "Post-money", "Headcount", "New-grad grant", "Cash vs market", "Odds of next stage"],
        STAGE_LADDER.map((r) => [r.stage, r.roundSize, r.postMoney, r.headcount, r.newGradGrant, r.cashVsMarket, r.nextStageOdds]),
      ));
    }
    if (s.id === "questions-to-ask") {
      parts.push(QUESTIONS_TO_ASK.map((q, i) => `${i + 1}. ${q}`).join("\n"));
    }
  }
  parts.push(`## Glossary\n\n${GLOSSARY.map((g) => `${g.term}: ${g.definition}`).join("\n\n")}`);
  return parts.join("\n\n");
}

/** A compact view of the stage parameters the simulation on tab one uses. */
function serializeParams(): string | null {
  try {
    const file = path.join(process.cwd(), "public/career-paths/params.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      startup: Record<string, Record<string, { value: number } | Record<string, { value: number }>>>;
    };
    const labels: Record<string, string> = {
      seed: "Seed", seriesAB: "Series A-B", growth: "Growth", bootstrapped: "Bootstrapped", pe: "Private equity",
    };
    const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
    const dollars = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(x >= 1e7 ? 0 : 1)}M` : `$${Math.round(x / 1e3)}K`);
    const rows = Object.entries(labels).map(([k, label]) => {
      const s = raw.startup[k];
      const v = (name: string) => (s[name] as { value: number }).value;
      const grant = (s.grantPctFD as Record<string, { value: number }>).technical.value;
      return [
        label, pct(v("failHazard")), pct(v("exitHazard")), dollars(v("exitMedian")),
        dollars(v("prefStack")), pct(grant, 3), pct(1 - v("salaryDiscount")),
      ];
    });
    return `## Simulation parameters\n\nThe simulation on tab one of the same page uses these per-stage parameters (annual rates, real dollars):\n\n${mdTable(
      ["Stage", "Annual shutdown odds", "Annual exit odds", "Median exit", "Preference stack", "New-grad grant (technical)", "Cash pay vs market"],
      rows,
    )}`;
  } catch {
    return null;
  }
}

let _system: string | null = null;

/** The frozen system block: rules, the brief, and the simulation parameters. */
export function buildSystemBlock(): string {
  if (!_system) {
    _system = [RULES, "# The brief", serializeBrief(), serializeParams()].filter(Boolean).join("\n\n");
  }
  return _system;
}

// ── Streaming ────────────────────────────────────────────────────────

export async function* askStream(question: string, history: AskTurn[] = []): AsyncGenerator<AskStreamEvent> {
  const system: SystemContentBlock[] = [
    { text: buildSystemBlock() },
    { cachePoint: { type: "default" } },
  ];

  const messages = [
    ...history.slice(-MAX_HISTORY).map((t) => ({ role: t.role, content: [{ text: t.content }] })),
    { role: "user" as const, content: [{ text: question.trim().slice(0, MAX_QUESTION) }] },
  ];

  const cmd = new ConverseStreamCommand({
    modelId: modelArn(),
    system,
    messages,
    inferenceConfig: { maxTokens: 400, temperature: 0.3 },
  });

  const resp = await client().send(cmd);
  if (!resp.stream) return;

  for await (const event of resp.stream) {
    if (event.contentBlockDelta?.delta?.text) {
      yield { type: "delta", text: event.contentBlockDelta.delta.text };
    } else if (event.metadata?.usage) {
      const u = event.metadata.usage;
      console.log(
        `[career-paths][ask] in=${u.inputTokens ?? 0} out=${u.outputTokens ?? 0}`
        + ` cache_read=${u.cacheReadInputTokens ?? 0} cache_write=${u.cacheWriteInputTokens ?? 0}`,
      );
      yield { type: "done" };
    }
  }
}
