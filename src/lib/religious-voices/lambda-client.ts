// SigV4-signed client for invoking the Religious Voices Python Lambda.
//
// The Lambda Function URL is AuthType=AWS_IAM (org policy forbids
// AuthType=NONE), so requests must be signed with AWS credentials.
// We resolve credentials via the same provider chain the NFL chat
// uses for Bedrock — in production on Amplify that resolves to
// whatever runtime credentials Amplify hands the SSR Lambda.
//
// SigV4 signing itself goes through aws4fetch (3 KB) rather than the
// full @aws-sdk/signature-v4, which adds a couple hundred KB to the
// SSR bundle.

import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { AwsClient } from "aws4fetch";

const REGION = process.env.AWS_REGION ?? "us-east-1";

function credentialProvider() {
  return process.env.AWS_PROFILE
    ? fromIni({ profile: process.env.AWS_PROFILE })
    : fromNodeProviderChain();
}

let _client: AwsClient | null = null;
let _credsExpiry: number | null = null;

async function getClient(): Promise<AwsClient> {
  // STS / IMDS credentials have an expiration. Re-resolve before they
  // expire so the signed requests we issue are accepted.
  if (_client && _credsExpiry && Date.now() < _credsExpiry - 60_000) {
    return _client;
  }
  const creds = await credentialProvider()();
  _client = new AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    service: "lambda",
    region: REGION,
  });
  _credsExpiry = creds.expiration ? creds.expiration.getTime() : Date.now() + 60 * 60 * 1000;
  return _client;
}

function lambdaUrl(): string | null {
  const url = process.env.RELIGIOUS_VOICES_LAMBDA_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

// Local-dev fallback URL — when RELIGIOUS_VOICES_LAMBDA_URL is unset
// (e.g., during `npm run dev`), proxy to the locally-running FastAPI
// server on port 8000. That mirrors prod's behavior end-to-end except
// for the signing step (local server doesn't need IAM auth).
const LOCAL_FALLBACK = "http://localhost:8000";

export async function signedFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = lambdaUrl();
  if (!url) {
    return fetch(`${LOCAL_FALLBACK}${path}`, init);
  }
  const aws = await getClient();
  return aws.fetch(`${url}${path}`, init);
}
