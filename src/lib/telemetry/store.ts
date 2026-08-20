// DynamoDB access for telemetry. One table, day-partitioned:
//
//   pk = "d#YYYY-MM-DD"        one partition per day
//   sk = "<epochMs>#<nonce>"   chronological + unique within the day
//
// Reads for the dashboard are a Query per day in the range, which is why the
// day is the partition key. Writes are batched. Rows self-expire via TTL.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { StoredEvent } from "./types";

const REGION = process.env.AWS_REGION ?? "us-east-1";

export const TABLE_NAME = process.env.TELEMETRY_TABLE ?? "";

let cached: DynamoDBDocumentClient | null = null;

function client(): DynamoDBDocumentClient {
  if (!cached) {
    const base = new DynamoDBClient({
      region: REGION,
      // Mirrors the credential handling in src/lib/religious-voices/*: an
      // explicit profile locally, the Amplify compute role in production.
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

export function partitionKey(day: string): string {
  return `d#${day}`;
}

/**
 * Write a batch of events. With no table configured (local dev) this logs
 * instead, so the whole client path can be exercised without AWS.
 */
export async function putEvents(events: StoredEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (!TABLE_NAME) {
    console.log("[telemetry] %d event(s)", events.length, JSON.stringify(events, null, 2));
    return;
  }
  // BatchWriteItem caps at 25 items per call.
  for (let i = 0; i < events.length; i += 25) {
    const chunk = events.slice(i, i + 25);
    await client().send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((Item) => ({ PutRequest: { Item } })),
        },
      }),
    );
  }
}

/** Read every event for a single day, following pagination. */
export async function queryDay(day: string): Promise<StoredEvent[]> {
  if (!TABLE_NAME) return [];
  const out: StoredEvent[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await client().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": partitionKey(day) },
        ExclusiveStartKey: startKey,
      }),
    );
    out.push(...((res.Items ?? []) as StoredEvent[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
}
