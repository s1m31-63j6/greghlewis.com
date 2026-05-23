// Per-IP rate limit backed by Azure Table Storage so it survives
// Function instance churn (unlike the in-memory bucket in
// src/lib/religious-voices/rate-limit.ts).
//
// Two caps:
//   - queries/day per IP   (AW_DAILY_QUERY_CAP_PER_IP, default 20)
//   - tokens/day per IP    (AW_DAILY_TOKEN_CAP_PER_IP, default 50000)
//
// Daily rollover: partitionKey = YYYYMMDD, rowKey = ipHash. Old rows
// expire naturally as they're never read after their date — no cleanup
// job needed at portfolio scale.

import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import * as crypto from "node:crypto";

const credential = new DefaultAzureCredential();

interface BucketRow {
  partitionKey: string;
  rowKey: string;
  query_count: number;
  token_count: number;
}

function tableClient(): TableClient {
  const account = process.env.AW_STORAGE_ACCOUNT;
  const tableName = process.env.AW_RATELIMIT_TABLE ?? "ratelimits";
  if (!account) throw new Error("AW_STORAGE_ACCOUNT not set");
  return new TableClient(
    `https://${account}.table.core.windows.net`,
    tableName,
    credential,
  );
}

export function hashIp(ip: string | null): string {
  const salt = process.env.AW_IP_HASH_SALT ?? "adventureworks-chat";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ip ?? "unknown"}`)
    .digest("hex")
    .slice(0, 24);
}

function todayKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export interface RateLimitDecision {
  allowed: boolean;
  reason?: "query_cap" | "token_cap";
  query_count: number;
  token_count: number;
  query_cap: number;
  token_cap: number;
}

export async function checkAndIncrementQuery(
  ipHash: string,
): Promise<RateLimitDecision> {
  const queryCap = Number(process.env.AW_DAILY_QUERY_CAP_PER_IP ?? "20");
  const tokenCap = Number(process.env.AW_DAILY_TOKEN_CAP_PER_IP ?? "50000");
  const client = tableClient();
  const pk = todayKey();
  const rk = ipHash;

  let row: BucketRow;
  try {
    row = await client.getEntity<BucketRow>(pk, rk);
  } catch {
    row = { partitionKey: pk, rowKey: rk, query_count: 0, token_count: 0 };
  }

  if (row.query_count >= queryCap) {
    return {
      allowed: false,
      reason: "query_cap",
      query_count: row.query_count,
      token_count: row.token_count,
      query_cap: queryCap,
      token_cap: tokenCap,
    };
  }
  if (row.token_count >= tokenCap) {
    return {
      allowed: false,
      reason: "token_cap",
      query_count: row.query_count,
      token_count: row.token_count,
      query_cap: queryCap,
      token_cap: tokenCap,
    };
  }

  row.query_count += 1;
  await client.upsertEntity(row, "Replace");
  return {
    allowed: true,
    query_count: row.query_count,
    token_count: row.token_count,
    query_cap: queryCap,
    token_cap: tokenCap,
  };
}

export async function recordTokens(
  ipHash: string,
  tokens: number,
): Promise<void> {
  const client = tableClient();
  const pk = todayKey();
  const rk = ipHash;
  let row: BucketRow;
  try {
    row = await client.getEntity<BucketRow>(pk, rk);
  } catch {
    row = { partitionKey: pk, rowKey: rk, query_count: 0, token_count: 0 };
  }
  row.token_count += tokens;
  await client.upsertEntity(row, "Replace");
}
