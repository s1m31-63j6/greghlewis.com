// Power BI Embedded + Microsoft.Fabric capacity client.
//
// Two distinct identities at play:
//   - The Function's MI calls the Azure Management plane (Fabric
//     resume/suspend) — it has Contributor on the capacity.
//   - A separate Service Principal (created in Phase 14) calls the
//     Power BI REST API (GenerateToken) — PBI doesn't yet support
//     system-assigned MIs for workspace operations. SP credential
//     lives in Key Vault.

import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();

const ARM_SCOPE = "https://management.azure.com/.default";
const PBI_RESOURCE = "https://analysis.windows.net/powerbi/api";
const PBI_SCOPE = `${PBI_RESOURCE}/.default`;

// ── Fabric capacity (Azure Management) ──────────────────────────────────

async function armToken(): Promise<string> {
  const tk = await credential.getToken(ARM_SCOPE);
  if (!tk) throw new Error("Failed to acquire ARM token");
  return tk.token;
}

function fabricApiBase(): string {
  const resourceId = process.env.AW_FABRIC_RESOURCE_ID;
  if (!resourceId) throw new Error("AW_FABRIC_RESOURCE_ID not set");
  return `https://management.azure.com${resourceId}`;
}

export type FabricState = "Active" | "Paused" | "Resuming" | "Pausing" | "Unknown";

export interface CapacityInfo {
  state: FabricState;
  raw: unknown;
}

export async function getCapacity(): Promise<CapacityInfo> {
  const token = await armToken();
  const url = `${fabricApiBase()}?api-version=2023-11-01`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    throw new Error(`Fabric GET failed: ${r.status} ${await r.text()}`);
  }
  const data = (await r.json()) as { properties?: { state?: string } };
  const raw = data.properties?.state ?? "Unknown";
  const state = (["Active", "Paused", "Resuming", "Pausing"].includes(raw)
    ? raw
    : "Unknown") as FabricState;
  return { state, raw: data };
}

async function postCapacityAction(action: "resume" | "suspend"): Promise<void> {
  const token = await armToken();
  const url = `${fabricApiBase()}/${action}?api-version=2023-11-01`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 202) {
    throw new Error(`Fabric ${action} failed: ${r.status} ${await r.text()}`);
  }
}

export const resumeCapacity = () => postCapacityAction("resume");
export const pauseCapacity = () => postCapacityAction("suspend");

export async function waitForActive(maxMs = 180_000): Promise<FabricState> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const info = await getCapacity();
    if (info.state === "Active") return info.state;
    if (info.state === "Paused" || info.state === "Pausing") {
      return info.state; // can't continue without explicit resume
    }
    await new Promise((res) => setTimeout(res, 5_000));
  }
  return "Unknown";
}

// ── Power BI REST (Service Principal) ───────────────────────────────────

let spCredentialCache: ClientSecretCredential | null = null;

async function pbiToken(): Promise<string> {
  if (!spCredentialCache) {
    const vaultName = process.env.AW_KEY_VAULT_NAME;
    const secretName = process.env.AW_PBI_SP_SECRET_NAME ?? "pbi-sp-secret";
    const tenantId = process.env.AW_PBI_SP_TENANT_ID;
    const clientId = process.env.AW_PBI_SP_CLIENT_ID;
    if (!vaultName || !tenantId || !clientId) {
      throw new Error("PBI SP env vars not set (AW_PBI_SP_TENANT_ID, AW_PBI_SP_CLIENT_ID, AW_KEY_VAULT_NAME)");
    }
    const kv = new SecretClient(`https://${vaultName}.vault.azure.net`, credential);
    const secret = await kv.getSecret(secretName);
    if (!secret.value) throw new Error("PBI SP secret missing value");
    spCredentialCache = new ClientSecretCredential(tenantId, clientId, secret.value);
  }
  const tk = await spCredentialCache.getToken(PBI_SCOPE);
  if (!tk) throw new Error("Failed to acquire PBI token");
  return tk.token;
}

export interface EmbedToken {
  token: string;
  expiration: string;
  reportId: string;
  embedUrl: string;
}

export async function generateEmbedToken(): Promise<EmbedToken> {
  const workspaceId = process.env.AW_PBI_WORKSPACE_ID;
  const reportId = process.env.AW_PBI_REPORT_ID;
  if (!workspaceId || !reportId) {
    throw new Error("AW_PBI_WORKSPACE_ID and AW_PBI_REPORT_ID must be set");
  }
  const token = await pbiToken();
  // First fetch the report to capture embedUrl
  const reportRes = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!reportRes.ok) {
    throw new Error(`PBI report GET failed: ${reportRes.status} ${await reportRes.text()}`);
  }
  const report = (await reportRes.json()) as { embedUrl: string };

  // Then generate the embed token
  const tokenRes = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}/GenerateToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessLevel: "View" }),
    },
  );
  if (!tokenRes.ok) {
    throw new Error(`PBI GenerateToken failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const body = (await tokenRes.json()) as { token: string; expiration: string };
  return {
    token: body.token,
    expiration: body.expiration,
    reportId,
    embedUrl: report.embedUrl,
  };
}

// ── Activity heartbeat ──────────────────────────────────────────────────

import { TableClient } from "@azure/data-tables";

interface ActivityRow {
  partitionKey: string;
  rowKey: string;
  last_activity_ms: number;
}

function activityTable(): TableClient {
  const account = process.env.AW_STORAGE_ACCOUNT;
  const tableName = process.env.AW_PBI_STATE_TABLE ?? "pbistate";
  if (!account) throw new Error("AW_STORAGE_ACCOUNT not set");
  return new TableClient(
    `https://${account}.table.core.windows.net`,
    tableName,
    credential,
  );
}

const ACTIVITY_PK = "pbi";
const ACTIVITY_RK = "last_active";

export async function recordActivity(): Promise<void> {
  try {
    const client = activityTable();
    await client.upsertEntity<ActivityRow>(
      {
        partitionKey: ACTIVITY_PK,
        rowKey: ACTIVITY_RK,
        last_activity_ms: Date.now(),
      },
      "Replace",
    );
  } catch (err) {
    console.warn("pbi activity write failed", err);
  }
}

export async function readLastActivity(): Promise<number | null> {
  try {
    const client = activityTable();
    const row = await client.getEntity<ActivityRow>(ACTIVITY_PK, ACTIVITY_RK);
    return row.last_activity_ms;
  } catch {
    return null;
  }
}
