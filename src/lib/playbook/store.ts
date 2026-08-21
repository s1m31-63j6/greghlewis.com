/**
 * DynamoDB access for playbooks. Single table, one partition per playbook:
 *
 *   pk = "pb#<id>"                 id = 12-char Crockford base32
 *   sk = "meta"                    the playbook header
 *   sk = "play#<pos>#<playId>"     pos zero-padded, gap-10 (0010, 0020, ...)
 *   sk = "rev#<playId>#<rev>"      capped revision history, TTL'd
 *
 * PER-PLAY ITEMS, not one blob. A hundred compositional plays would fit inside
 * the 400KB item ceiling, but per-play items win on three counts: saving one
 * edited play is a 1KB PutItem rather than a 200KB rewrite; two people on the
 * same share link editing different plays cannot clobber each other, and with
 * no auth there is nothing to arbitrate if they do; and the read costs the same
 * either way, because one Query on the partition returns everything in a single
 * page. Gap-10 positions in the sort key mean that Query comes back already in
 * the coach's order, and a reorder rewrites only the play that moved.
 *
 * `doc` is stored as a JSON STRING rather than a nested map. DynamoDB bills the
 * attribute name on every nested key, and eleven assignments repeat "kind" and
 * "route" and "mods" eleven times. The facets stay top-level so the grid can
 * render a hundred plays without deserialising any of them.
 *
 * No GSI. Without auth there is no "list my playbooks", so the index nothing
 * queries does not get built.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";

import { deriveFacets } from "./search.ts";
import type { BookEntry, BookStyle, Play, Playbook } from "./types.ts";

const REGION = process.env.AWS_REGION ?? "us-east-1";
export const TABLE_NAME = process.env.PLAYBOOK_TABLE ?? "";

/** Eighteen months, refreshed on every write. Abandoned books vacuum themselves. */
const TTL_DAYS = 548;

let cached: DynamoDBDocumentClient | null = null;

function client(): DynamoDBDocumentClient {
  if (!cached) {
    const base = new DynamoDBClient({
      region: REGION,
      // Mirrors src/lib/telemetry/store.ts: an explicit profile locally, the
      // Amplify compute role in production.
      credentials: process.env.AWS_PROFILE
        ? fromIni({ profile: process.env.AWS_PROFILE })
        : fromNodeProviderChain(),
    });
    cached = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return cached;
}

export const configured = () => TABLE_NAME.length > 0;

/**
 * True when playbooks can actually be persisted.
 *
 * The in-memory fallback below is a development convenience: it is what lets
 * the entire client path be exercised with no AWS at all. In production it
 * would be a save button that quietly loses a coach's work between Lambda
 * instances, so the routes refuse to pretend instead.
 */
export const storageAvailable = () =>
  configured() || process.env.NODE_ENV !== "production";

// ── local fallback ──────────────────────────────────────────────────────────
// With no table configured the whole app still works, in memory, for one
// server process. That is what lets the entire client path be exercised with
// zero AWS — the same trade the telemetry store makes, and the reason local
// development needs no credentials at all.
// Hung off globalThis rather than held in a module variable, because route
// handlers and server components are separate module graphs in dev: a plain
// module-level Map means the API can write a playbook the print page then
// cannot find. It also survives hot reload, which the module variable did not.
const dev = globalThis as typeof globalThis & {
  __playbookMemory?: Map<string, Playbook>;
  __playbookTokens?: Map<string, string>;
};
const memory = (dev.__playbookMemory ??= new Map<string, Playbook>());
// The token gate is held here too, so the read-only path is exercised locally
// rather than only in production — a permission check that is a no-op in
// development is a permission check nobody ever tests.
const memoryTokens = (dev.__playbookTokens ??= new Map<string, string>());

// ── ids ─────────────────────────────────────────────────────────────────────

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U

export function newId(len = 12): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const pk = (id: string) => `pb#${id}`;
const pos = (n: number) => String(n).padStart(4, "0");
const playSk = (position: number, playId: string) => `play#${pos(position)}#${playId}`;
const expiry = () => Math.floor(Date.now() / 1000) + TTL_DAYS * 86_400;

// ── read ────────────────────────────────────────────────────────────────────

interface MetaItem {
  name: string;
  variant: Playbook["variant"];
  style: BookStyle;
  createdAt: string;
  updatedAt: string;
  roster?: Playbook["roster"];
  editTokenHash?: string;
}

interface PlayItem {
  sk: string;
  playId: string;
  position: number;
  section?: string;
  callNumber?: string;
  doc: string;
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  if (!configured()) return memory.get(id) ?? null;

  // The whole partition, in one condition. `begins_with(sk, "")` looks
  // harmless and is rejected outright by DynamoDB — an empty string is not a
  // legal attribute value in a key condition — which the in-memory development
  // fallback could never have shown. Filtering by sk prefix happens below.
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await client().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk(id) },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(res.Items ?? []));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  const meta = items.find((i) => i.sk === "meta") as (MetaItem & { sk: string }) | undefined;
  if (!meta) return null;

  const entries: BookEntry[] = items
    .filter((i) => typeof i.sk === "string" && i.sk.startsWith("play#"))
    .map((i) => {
      const item = i as unknown as PlayItem;
      return {
        play: JSON.parse(item.doc) as Play,
        position: item.position,
        section: item.section,
        callNumber: item.callNumber,
      };
    })
    .sort((a, b) => a.position - b.position);

  return {
    id,
    name: meta.name,
    variant: meta.variant,
    style: meta.style,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    roster: meta.roster,
    entries,
  };
}

export async function getEditTokenHash(id: string): Promise<string | null> {
  if (!configured()) return memoryTokens.get(id) ?? null;
  const res = await client().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND sk = :sk",
      ExpressionAttributeValues: { ":pk": pk(id), ":sk": "meta" },
    }),
  );
  const meta = res.Items?.[0] as MetaItem | undefined;
  return meta?.editTokenHash ?? null;
}

// ── write ───────────────────────────────────────────────────────────────────

function playItem(id: string, e: BookEntry) {
  const f = deriveFacets(e.play);
  return {
    pk: pk(id),
    sk: playSk(e.position, e.play.spec.id),
    type: "play",
    playId: e.play.spec.id,
    position: e.position,
    section: e.section,
    callNumber: e.callNumber,
    rev: e.play.lineage?.rev ?? 1,
    updatedAt: new Date().toISOString(),
    exp: expiry(),
    doc: JSON.stringify(e.play),
    // Denormalised so the grid renders without parsing a hundred documents.
    name: e.play.spec.name,
    family: f.type,
    philosophy: f.philosophy,
    formation: f.formation,
    target: f.target,
    situations: f.situations,
  };
}

export async function putPlaybook(book: Playbook, editTokenHash?: string): Promise<void> {
  if (!configured()) {
    memory.set(book.id, book);
    if (editTokenHash) memoryTokens.set(book.id, editTokenHash);
    return;
  }
  const now = new Date().toISOString();
  const items = [
    {
      pk: pk(book.id),
      sk: "meta",
      type: "meta",
      name: book.name,
      variant: book.variant,
      style: book.style,
      roster: book.roster,
      createdAt: book.createdAt,
      updatedAt: now,
      playCount: book.entries.length,
      editTokenHash,
      exp: expiry(),
    },
    ...book.entries.map((e) => playItem(book.id, e)),
  ];

  // BatchWriteItem caps at 25 per call.
  for (let i = 0; i < items.length; i += 25) {
    await client().send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })),
        },
      }),
    );
  }
}

/** Saving one edited play is a single small write, which is the whole point. */
export async function putPlay(id: string, entry: BookEntry): Promise<void> {
  if (!configured()) {
    const book = memory.get(id);
    if (!book) return;
    const i = book.entries.findIndex((e) => e.play.spec.id === entry.play.spec.id);
    if (i >= 0) book.entries[i] = entry;
    else book.entries.push(entry);
    book.entries.sort((a, b) => a.position - b.position);
    book.updatedAt = new Date().toISOString();
    return;
  }
  await client().send(new PutCommand({ TableName: TABLE_NAME, Item: playItem(id, entry) }));
}

export async function deletePlay(id: string, position: number, playId: string): Promise<void> {
  if (!configured()) {
    const book = memory.get(id);
    if (book) book.entries = book.entries.filter((e) => e.play.spec.id !== playId);
    return;
  }
  await client().send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: pk(id), sk: playSk(position, playId) } }),
  );
}

export async function deletePlaybook(id: string): Promise<void> {
  if (!configured()) {
    memory.delete(id);
    memoryTokens.delete(id);
    return;
  }
  const res = await client().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk(id) },
      ProjectionExpression: "pk, sk",
    }),
  );
  const keys = (res.Items ?? []).map((i) => ({ DeleteRequest: { Key: { pk: i.pk, sk: i.sk } } }));
  for (let i = 0; i < keys.length; i += 25) {
    await client().send(
      new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: keys.slice(i, i + 25) } }),
    );
  }
}

/**
 * Gap-10 positions: inserting between 0020 and 0030 becomes 0025, so a reorder
 * rewrites one item instead of renumbering the book.
 */
export function positionsFor(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * 10);
}

export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 10;
  if (before === null) return Math.max(1, (after as number) - 10);
  if (after === null) return before + 10;
  const mid = Math.floor((before + after) / 2);
  return mid === before ? before + 1 : mid;
}
