// Azure SQL client — Managed Identity auth via @azure/identity, mssql
// driver in pooled mode.
//
// The Function's MI is added to AdventureWorksDW as a contained user
// (manual step in DEPLOY.md Phase 11) and granted db_datareader on dbo.
// No password ever lives in code or env vars.

import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();
const SQL_SCOPE = "https://database.windows.net/.default";

let pool: sql.ConnectionPool | null = null;
let poolInitializing: Promise<sql.ConnectionPool> | null = null;

async function buildPool(): Promise<sql.ConnectionPool> {
  const server = process.env.AW_SQL_SERVER;
  const database = process.env.AW_SQL_DATABASE;
  if (!server || !database) {
    throw new Error("AW_SQL_SERVER and AW_SQL_DATABASE must be set");
  }
  const tk = await credential.getToken(SQL_SCOPE);
  if (!tk) throw new Error("Failed to acquire Azure SQL token");
  const config: sql.config = {
    server,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: {
        token: tk.token,
      },
    },
    // Azure SQL Serverless auto-pauses after 60 min idle. Wake-up from
    // a cold DB typically takes 10-30s on the first connection. Be
    // generous on connectionTimeout so the first request after idle
    // doesn't fail. Subsequent connections from a warm pool are instant.
    connectionTimeout: 60_000,
    requestTimeout: 15_000,
    pool: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };
  const p = new sql.ConnectionPool(config);
  await p.connect();
  return p;
}

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  if (poolInitializing) return poolInitializing;
  poolInitializing = (async () => {
    pool = await buildPool();
    poolInitializing = null;
    return pool;
  })();
  return poolInitializing;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  elapsed_ms: number;
}

const MAX_ROWS_RETURNED = 500;

export async function executeQuery(rawSql: string): Promise<QueryResult> {
  const p = await getPool();
  const start = Date.now();
  const result = await p.request().query(rawSql);
  const elapsed = Date.now() - start;
  const recordset = result.recordset ?? [];
  const columns = recordset.length > 0 ? Object.keys(recordset[0]) : [];
  const rows = recordset
    .slice(0, MAX_ROWS_RETURNED)
    .map((row: Record<string, unknown>) => columns.map((c) => row[c]));
  return {
    columns,
    rows,
    row_count: recordset.length,
    elapsed_ms: elapsed,
  };
}
