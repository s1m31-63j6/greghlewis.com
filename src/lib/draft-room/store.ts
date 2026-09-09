// Draft state in the playbook table (same partition/TTL conventions, zero new
// infrastructure). One partition per league:
//
//   pk = "draft#<leagueId>"
//   sk = "meta"          { startedAt }
//   sk = "pick#0007"     { playerId, team, by, at }   index zero-padded
//
// Every write is a conditional PutItem on attribute_not_exists(sk). Two owners
// submitting for the same slot at the same moment: exactly one wins, the other
// gets a 409 and the fresh board. That single condition is the whole
// concurrency story.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";

import { LEAGUE_ID } from "./league.ts";

export type Pick = { index: number; playerId: string; team: string; by: string; at: string };
export type DraftState = { started: boolean; startedAt?: string; picks: Pick[] };

export class Conflict extends Error {}

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLE_NAME = process.env.PLAYBOOK_TABLE ?? "";
const PK = `draft#${LEAGUE_ID}`;
const TTL_DAYS = 7;

const pickSk = (index: number) => `pick#${String(index).padStart(4, "0")}`;
const expiry = () => Math.floor(Date.now() / 1000) + TTL_DAYS * 86_400;

let cached: DynamoDBDocumentClient | null = null;
function client(): DynamoDBDocumentClient {
  if (!cached) {
    const base = new DynamoDBClient({
      region: REGION,
      credentials: process.env.AWS_PROFILE
        ? fromIni({ profile: process.env.AWS_PROFILE })
        : fromNodeProviderChain(),
    });
    cached = DynamoDBDocumentClient.from(base, { marshallOptions: { removeUndefinedValues: true } });
  }
  return cached;
}

// In-memory fallback for local dev with no table configured. Same shape, one
// process, survives hot reload via globalThis.
const dev = globalThis as typeof globalThis & { __draftMemory?: Map<string, Record<string, unknown>> };
const memory = (dev.__draftMemory ??= new Map());
const configured = TABLE_NAME.length > 0;

async function putIfAbsent(sk: string, attrs: Record<string, unknown>): Promise<void> {
  if (!configured) {
    if (memory.has(sk)) throw new Conflict(sk);
    memory.set(sk, attrs);
    return;
  }
  try {
    await client().send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { pk: PK, sk, ...attrs, exp: expiry() },
        ConditionExpression: "attribute_not_exists(sk)",
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") throw new Conflict(sk);
    throw err;
  }
}

export async function getState(): Promise<DraftState> {
  let items: Record<string, unknown>[];
  if (!configured) {
    items = [...memory.entries()].map(([sk, v]) => ({ sk, ...v }));
  } else {
    const res = await client().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": PK },
      }),
    );
    items = (res.Items ?? []) as Record<string, unknown>[];
  }
  const meta = items.find((i) => i.sk === "meta");
  const picks = items
    .filter((i) => typeof i.sk === "string" && i.sk.startsWith("pick#"))
    .map((i) => ({
      index: Number((i.sk as string).slice(5)),
      playerId: String(i.playerId),
      team: String(i.team),
      by: String(i.by ?? ""),
      at: String(i.at ?? ""),
    }))
    .sort((a, b) => a.index - b.index);
  return { started: Boolean(meta), startedAt: meta?.startedAt as string | undefined, picks };
}

export async function start(): Promise<void> {
  await putIfAbsent("meta", { startedAt: new Date().toISOString() });
}

export async function addPick(pick: Omit<Pick, "at">): Promise<void> {
  await putIfAbsent(pickSk(pick.index), {
    playerId: pick.playerId,
    team: pick.team,
    by: pick.by,
    at: new Date().toISOString(),
  });
}

export async function undoLast(): Promise<void> {
  const { picks } = await getState();
  const last = picks.at(-1);
  if (!last) return;
  const sk = pickSk(last.index);
  if (!configured) {
    memory.delete(sk);
    return;
  }
  await client().send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: PK, sk } }));
}

/** Wipe the partition. curl-only escape hatch, not in the UI. */
export async function reset(): Promise<void> {
  const { picks, started } = await getState();
  const sks = [...picks.map((p) => pickSk(p.index)), ...(started ? ["meta"] : [])];
  if (!configured) {
    memory.clear();
    return;
  }
  for (const sk of sks) {
    await client().send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: PK, sk } }));
  }
}
