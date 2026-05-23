// POST /chat — the main orchestrator.
//
// Pipeline:
//   1. Turnstile verify + per-IP rate limit
//   2. Stage A: model generates SQL (JSON-mode { sql, rationale })
//   3. Validate SQL via node-sql-parser AST
//   4. Execute on Azure SQL (MI-authenticated mssql)
//   5. Stage B: model generates narrative + Vega-Lite chart spec
//   6. Stream every step as SSE events; log to Table Storage; return.

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  completeJson as aoaiComplete,
  aoaiCostEstimate,
} from "../lib/azure-openai.js";
import {
  completeJson as claudeComplete,
  claudeCostEstimate,
} from "../lib/claude.js";
import { validateSql } from "../lib/sql-validator.js";
import { executeQuery } from "../lib/sql-client.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import {
  checkAndIncrementQuery,
  recordTokens,
  hashIp,
} from "../lib/rate-limit.js";
import { buildLogRow, logChat } from "../lib/logging.js";
import { createSseStream } from "../lib/sse.js";
import { SQL_SYSTEM_PROMPT, NARRATIVE_SYSTEM_PROMPT } from "../lib/prompts.js";
import type {
  ChatRequestBody,
  ModelChoice,
  ModelMeta,
  StreamEvent,
  ChartSpec,
} from "../lib/types.js";

const MAX_ROWS_TO_MODEL = 50; // truncate result set passed to narrative stage
const ALLOWED_HISTORY_TURNS = 6;

app.http("chat", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "chat",
  handler: handleChat,
});

async function handleChat(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return corsPreflight();
  }

  // Parse the body before we open the stream — if it's malformed, we
  // want to return a plain 400, not an SSE error.
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const query = (body?.query ?? "").toString().trim();
  if (!query) return json(400, { error: "Missing 'query'" });
  if (query.length > 500) {
    return json(400, { error: "Query too long (500 char max)" });
  }
  const model: ModelChoice = body?.model === "claude" ? "claude" : "azure-openai";
  const history = Array.isArray(body?.history) ? body.history : [];
  const trimmedHistory = history.slice(-ALLOWED_HISTORY_TURNS);

  const ip = clientIp(req);
  const ipHash = hashIp(ip);

  // Pre-stream gate: Turnstile + rate limit.
  const turnstile = await verifyTurnstile(body?.turnstile_token, ip);
  if (!turnstile.ok) {
    return json(403, { error: `Turnstile verification failed: ${turnstile.reason}` });
  }
  const rl = await checkAndIncrementQuery(ipHash);
  if (!rl.allowed) {
    return json(429, {
      error: `Daily ${rl.reason === "token_cap" ? "token" : "query"} cap reached`,
      query_count: rl.query_count,
      token_count: rl.token_count,
      query_cap: rl.query_cap,
      token_cap: rl.token_cap,
    });
  }

  const stream = createSseStream();

  // Fire-and-forget the pipeline. The HTTP response returns immediately
  // with the stream body; the pipeline writes events asynchronously.
  void runPipeline({
    query,
    model,
    history: trimmedHistory,
    ipHash,
    emit: stream.emit,
    closeStream: stream.close,
    abortStream: stream.abort,
    ctx,
  });

  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
    // The @azure/functions HttpResponseBodyInit type expects a ReadableStream
    // shape that exposes `values` / `[Symbol.asyncIterator]`. Node's web
    // ReadableStream has both at runtime but the lib.dom typings are stale
    // — cast through unknown to keep strict mode happy.
    body: stream.readable as unknown as HttpResponseInit["body"],
  };
}

interface PipelineArgs {
  query: string;
  model: ModelChoice;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  ipHash: string;
  emit: (e: StreamEvent) => Promise<void>;
  closeStream: () => Promise<void>;
  abortStream: (err: unknown) => Promise<void>;
  ctx: InvocationContext;
}

async function runPipeline(args: PipelineArgs): Promise<void> {
  const { query, model, history, ipHash, emit, closeStream, ctx } = args;
  const pipelineStart = Date.now();
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalCost = 0;
  let modelId = "";
  let generatedSql: string | undefined;
  let validationOk = false;
  let rowCount: number | undefined;
  let success = false;
  let errorMessage: string | undefined;

  try {
    // ── Stage A: SQL generation ─────────────────────────────────────────
    await emit({ type: "status", message: "Generating SQL…" });

    const stageA = await callModel(model, SQL_SYSTEM_PROMPT, query, history);
    modelId = stageA.model;
    totalPrompt += stageA.prompt_tokens;
    totalCompletion += stageA.completion_tokens;
    totalCost += stageA.cost_est;

    let parsedSql: { sql?: string; rationale?: string };
    try {
      parsedSql = JSON.parse(stageA.content);
    } catch {
      throw new Error(`Model returned non-JSON for SQL stage: ${stageA.content.slice(0, 120)}`);
    }
    generatedSql = (parsedSql.sql ?? "").trim();
    if (!generatedSql) throw new Error("Model returned empty SQL");
    await emit({ type: "sql", sql: generatedSql });

    // ── SQL validation ──────────────────────────────────────────────────
    const v = validateSql(generatedSql);
    validationOk = v.ok;
    await emit({ type: "validation", ok: v.ok, errors: v.errors });
    if (!v.ok || !v.normalizedSql) {
      throw new Error(`SQL validation failed: ${v.errors?.join("; ") ?? "unknown"}`);
    }

    // ── Stage B: execute ────────────────────────────────────────────────
    await emit({ type: "status", message: "Querying AdventureWorksDW…" });
    const queryResult = await executeQuery(v.normalizedSql);
    rowCount = queryResult.row_count;
    await emit({
      type: "rows",
      columns: queryResult.columns,
      rows: queryResult.rows,
      row_count: queryResult.row_count,
    });

    // ── Stage C: narrative + chart ──────────────────────────────────────
    await emit({ type: "status", message: "Summarising the result…" });
    const sampleRows = queryResult.rows.slice(0, MAX_ROWS_TO_MODEL);
    const narrativeUserMessage = JSON.stringify({
      original_question: query,
      executed_sql: v.normalizedSql,
      columns: queryResult.columns,
      rows: sampleRows,
      row_count: queryResult.row_count,
      truncated: queryResult.row_count > MAX_ROWS_TO_MODEL,
    });

    const stageB = await callModel(model, NARRATIVE_SYSTEM_PROMPT, narrativeUserMessage, []);
    totalPrompt += stageB.prompt_tokens;
    totalCompletion += stageB.completion_tokens;
    totalCost += stageB.cost_est;

    let parsedNarrative: { narrative?: string; chart_spec?: ChartSpec };
    try {
      parsedNarrative = JSON.parse(stageB.content);
    } catch {
      throw new Error(
        `Model returned non-JSON for narrative stage: ${stageB.content.slice(0, 120)}`,
      );
    }
    if (parsedNarrative.narrative) {
      await emit({ type: "narrative", content: parsedNarrative.narrative });
    }
    if (parsedNarrative.chart_spec) {
      await emit({ type: "chart", spec: parsedNarrative.chart_spec });
    }

    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    ctx.error("chat pipeline failed", err);
    await emit({ type: "error", message: errorMessage });
  } finally {
    const meta: ModelMeta = {
      model,
      model_id: modelId,
      latency_ms: Date.now() - pipelineStart,
      prompt_tokens: totalPrompt,
      completion_tokens: totalCompletion,
      cost_est_usd: Number(totalCost.toFixed(6)),
    };
    await emit({ type: "meta", meta });
    await emit({ type: "done" });
    await closeStream();

    // Side-effect writes — never block the client.
    void recordTokens(ipHash, totalPrompt + totalCompletion).catch(() => undefined);
    void logChat(
      buildLogRow({
        ip_hash: ipHash,
        model,
        model_id: modelId,
        query,
        generated_sql: generatedSql,
        validation_ok: validationOk,
        row_count: rowCount,
        success,
        error: errorMessage,
        latency_ms: meta.latency_ms,
        prompt_tokens: totalPrompt,
        completion_tokens: totalCompletion,
        cost_est_usd: meta.cost_est_usd,
        timestamp: new Date().toISOString(),
      }),
    ).catch(() => undefined);
  }
}

interface ModelCallResult {
  content: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_est: number;
}

async function callModel(
  model: ModelChoice,
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ModelCallResult> {
  if (model === "claude") {
    const r = await claudeComplete(systemPrompt, userMessage, history);
    return {
      content: r.content,
      model: r.model,
      prompt_tokens: r.prompt_tokens,
      completion_tokens: r.completion_tokens,
      cost_est: claudeCostEstimate(r.prompt_tokens, r.completion_tokens),
    };
  }
  const r = await aoaiComplete(systemPrompt, userMessage, history);
  return {
    content: r.content,
    model: r.model,
    prompt_tokens: r.prompt_tokens,
    completion_tokens: r.completion_tokens,
    cost_est: aoaiCostEstimate(r.prompt_tokens, r.completion_tokens),
  };
}

function clientIp(req: HttpRequest): string | null {
  // Amplify/Cloudfront chain may add x-forwarded-for as a comma-separated list.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return null;
}

function corsPreflight(): HttpResponseInit {
  return {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  };
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
