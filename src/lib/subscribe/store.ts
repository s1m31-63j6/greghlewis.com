/**
 * DynamoDB access for signups.
 *
 *   pk = "sub#<email lowercased>"     one partition per person
 *   sk = "signup#<iso timestamp>"     one item per submission
 *
 * A repeat signup from a different project is a second row on purpose — the
 * second row is the one that says a project pulled somebody back.
 *
 * Reads are a Scan. That is the right call at this size and would be the wrong
 * one at a hundred thousand rows: there is no access pattern here except "show
 * me everyone", no GSI would help, and a Scan over a few hundred small items
 * costs less than a rounding error. Revisit it when the dashboard gets slow,
 * which is a problem worth having.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";

const REGION = process.env.AWS_REGION ?? "us-east-1";

export const TABLE_NAME = process.env.SUBSCRIBERS_TABLE ?? "";

export interface Signup {
  email: string;
  /** A `SOURCE_IDS` value — which page the person was on. */
  source: string;
  note?: string;
  createdAt: string;
}

let cached: DynamoDBDocumentClient | null = null;

function client(): DynamoDBDocumentClient {
  if (!cached) {
    const base = new DynamoDBClient({
      region: REGION,
      // An explicit profile locally, the Amplify compute role in production —
      // the same handling as the telemetry and playbook stores.
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

/**
 * Record one signup.
 *
 * With no table configured this logs instead, so the form, the validation and
 * the success state can all be exercised locally without AWS credentials — but
 * ONLY outside production. In production a missing table is a thrown error and
 * a 500, because the alternative is telling somebody who just typed their
 * address that they are on a list which never received them. That is the same
 * failure the user-agent filter would have caused, and it is worth being loud
 * about in both places.
 */
export async function putSignup(signup: Signup): Promise<void> {
  if (!TABLE_NAME) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUBSCRIBERS_TABLE is not configured");
    }
    console.log("[subscribe] (no table configured)", {
      ...signup,
      email: redact(signup.email),
    });
    return;
  }

  await client().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `sub#${signup.email.toLowerCase()}`,
        sk: `signup#${signup.createdAt}`,
        email: signup.email,
        source: signup.source,
        note: signup.note,
        createdAt: signup.createdAt,
        day: signup.createdAt.slice(0, 10),
      },
    }),
  );
}

/** Newest first. */
export async function listSignups(limit = 500): Promise<Signup[]> {
  if (!TABLE_NAME) return [];

  const rows: Signup[] = [];
  let start: Record<string, unknown> | undefined;

  do {
    const page = await client().send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: start,
      }),
    );
    for (const item of page.Items ?? []) {
      rows.push({
        email: String(item.email ?? ""),
        source: String(item.source ?? "unknown"),
        note: item.note ? String(item.note) : undefined,
        createdAt: String(item.createdAt ?? ""),
      });
    }
    start = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start && rows.length < limit);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Enough of an address to recognise it in a log, not enough to be a leak. */
function redact(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}
