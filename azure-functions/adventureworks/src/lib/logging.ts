// Chatlog writer — Azure Table Storage, fire-and-forget.
// Append every turn so the methodology page later has corpus for the
// A/B writeup.

import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import type { ChatLogRow } from "./types.js";
import * as crypto from "node:crypto";

const credential = new DefaultAzureCredential();

function tableClient(): TableClient {
  const account = process.env.AW_STORAGE_ACCOUNT;
  const tableName = process.env.AW_CHATLOG_TABLE ?? "chatlogs";
  if (!account) throw new Error("AW_STORAGE_ACCOUNT not set");
  return new TableClient(
    `https://${account}.table.core.windows.net`,
    tableName,
    credential,
  );
}

export function buildLogRow(input: Omit<ChatLogRow, "partitionKey" | "rowKey">): ChatLogRow {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const pk = `${y}${m}`;
  const rk = `${now.getTime()}_${crypto.randomBytes(4).toString("hex")}`;
  return { partitionKey: pk, rowKey: rk, ...input };
}

export async function logChat(row: ChatLogRow): Promise<void> {
  try {
    const client = tableClient();
    await client.createEntity(row);
  } catch (err) {
    // Logging must never fail the chat. Swallow + console.warn for App Insights pickup.
    console.warn("chatlog write failed", err);
  }
}
