#!/usr/bin/env node
// Loads AdventureWorksDW into the deployed Azure SQL server.
//
// Strategy: the official `instawdbdw.sql` install script uses BULK
// INSERT from local file paths — we rewrite each BULK INSERT to point
// at the CSVs we uploaded to blob storage via a DATABASE SCOPED
// CREDENTIAL + EXTERNAL DATA SOURCE. The DDL/FK/index statements run
// unchanged.
//
// Requirements:
//   - DEPLOY_OUTPUTS=path to deploy-outputs.json (default: ../deploy-outputs.json)
//   - SQL admin password from ../.sql-admin-password
//   - Blob container `awdw-csv` populated with the install-script CSVs
//   - Azure CLI logged in (used to mint the container SAS)
//
// Run with:
//   node azure-infra/scripts/load-aw-db.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import sql from "mssql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INFRA = path.resolve(__dirname, "..");

const outputs = JSON.parse(
  fs.readFileSync(path.join(INFRA, "deploy-outputs.json"), "utf8"),
);
const SQL_FQDN = outputs.sqlServerFqdn.value;
const STORAGE = outputs.storageAccountName.value;
const DB = "AdventureWorksDW";
const ADMIN_LOGIN = "awadmin";
const ADMIN_PASSWORD = fs
  .readFileSync(path.join(INFRA, ".sql-admin-password"), "utf8")
  .trim();
const CSV_CONTAINER = "awdw-csv";
const INSTALL_SCRIPT = "/tmp/awdw-scripts/instawdbdw.sql";

// ── Helpers ────────────────────────────────────────────────────────────

function mintContainerSas() {
  const d = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const expiry =
    `${d.getUTCFullYear()}-` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getUTCDate()).padStart(2, "0")}T` +
    `${String(d.getUTCHours()).padStart(2, "0")}:` +
    `${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
  // Azure SQL CREDENTIAL with IDENTITY='SHARED ACCESS SIGNATURE' wants
  // an ACCOUNT SAS, not a user-delegation SAS. Fetch the account key
  // ephemerally to mint a true account SAS.
  const accountKey = execSync(
    `az storage account keys list \
      --account-name ${STORAGE} \
      --query "[0].value" -o tsv`,
    { encoding: "utf8" },
  ).trim();
  const sas = execSync(
    `az storage container generate-sas \
      --account-name ${STORAGE} \
      --account-key '${accountKey}' \
      --name ${CSV_CONTAINER} \
      --permissions rl \
      --expiry ${expiry} \
      --https-only \
      -o tsv`,
    { encoding: "utf8" },
  ).trim();
  return sas;
}

function connectionConfig(database) {
  const [server] = SQL_FQDN.split(".");
  return {
    server: SQL_FQDN,
    user: ADMIN_LOGIN,
    password: ADMIN_PASSWORD,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    connectionTimeout: 30_000,
    requestTimeout: 600_000,
  };
}

async function withConnection(database, fn) {
  const pool = await new sql.ConnectionPool(connectionConfig(database)).connect();
  try {
    return await fn(pool);
  } finally {
    await pool.close();
  }
}

// ── Step 1: create the database ────────────────────────────────────────

async function ensureDatabase() {
  console.log(`[1] Verify database ${DB} exists (creation is via az CLI)`);
  // CREATE DATABASE for Azure SQL Serverless has a peculiar T-SQL syntax
  // that varies between tiers; we provision the DB via `az sql db create`
  // before invoking this script. Just sanity-check it's online.
  await withConnection("master", async (pool) => {
    const r = await pool
      .request()
      .input("name", sql.NVarChar, DB)
      .query("SELECT state_desc FROM sys.databases WHERE name = @name");
    if (r.recordset.length === 0) {
      throw new Error(`Database ${DB} does not exist. Create it via 'az sql db create' first.`);
    }
    console.log(`    state: ${r.recordset[0].state_desc}`);
  });
}

// ── Step 2: parse the install script ───────────────────────────────────

function parseInstallScript() {
  const raw = fs.readFileSync(INSTALL_SCRIPT, "utf8");
  // Strip the SQLCMD directives we don't need:
  let cleaned = raw
    .replace(/^:setvar\s+\w+\s+.*$/gm, "")
    .replace(/^:r\s+.*$/gm, "")
    .replace(/^:cmd\s+.*$/gm, "")
    .replace(/^:on\s+error\s+\w+\s*$/gim, "")
    .replace(/\$\(DatabaseName\)/g, DB)
    .replace(/\$\(SqlSamplesSourceDataPath\)/g, "__BLOB__/");

  // CREATE DATABASE handled by ensureDatabase() above — remove that block.
  cleaned = cleaned.replace(
    /USE\s+\[master\][\s\S]*?CREATE DATABASE[\s\S]*?GO/g,
    "",
  );

  // Split on `GO` batch separators (case-insensitive, must be on its own line).
  const batches = cleaned
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  // Classify each batch by full-text content (the batches are large and
  // BULK INSERTs sit further than 200 chars into the data-load batch).
  const tableDdl = [];
  const bulkInserts = [];
  const constraints = [];
  const other = [];

  for (const batch of batches) {
    const upper = batch.toUpperCase();
    const head = upper.slice(0, 200);
    if (upper.includes("BULK INSERT")) {
      bulkInserts.push(batch);
    } else if (head.includes("CREATE TABLE") || head.includes("CREATE FULLTEXT")) {
      tableDdl.push(batch);
    } else if (
      head.includes("ALTER TABLE") &&
      (head.includes("ADD CONSTRAINT") || head.includes("FOREIGN KEY") || head.includes("CHECK"))
    ) {
      constraints.push(batch);
    } else if (head.startsWith("USE ")) {
      // Skip — we connect to AdventureWorksDW directly.
    } else {
      other.push(batch);
    }
  }

  console.log(
    `[2] Parsed install script: ${tableDdl.length} CREATE TABLE, ` +
      `${bulkInserts.length} BULK INSERT, ${constraints.length} constraints, ` +
      `${other.length} other`,
  );
  return { tableDdl, bulkInserts, constraints, other };
}

// ── Step 3: rewrite BULK INSERT to use the blob DATA_SOURCE ────────────

function rewriteBulkInsert(batch) {
  // Original:  BULK INSERT [dbo].[X] FROM '__BLOB__/X.csv' WITH ( ... )
  // Rewritten: BULK INSERT [dbo].[X] FROM 'X.csv' WITH ( DATA_SOURCE = 'AwdwCsvSource', ... )
  // Plus: replace ROWTERMINATOR = '\n' with 0x0a (Azure SQL BULK INSERT
  // doesn't honour the '\n' literal — it needs the hex escape).
  return batch
    .replace(
      /BULK\s+INSERT\s*(\[?dbo\]?\.\[?\w+\]?)\s+FROM\s+'__BLOB__\/([^']+)'\s+WITH\s*\(/gi,
      (_, table, file) =>
        `BULK INSERT ${table} FROM '${file}' WITH ( DATA_SOURCE = 'AwdwCsvSource',`,
    )
    .replace(/ROWTERMINATOR\s*=\s*'\\n'/gi, "ROWTERMINATOR = '0x0a'");
}

// ── Step 4: execute ────────────────────────────────────────────────────

async function loadDb() {
  await ensureDatabase();
  const { tableDdl, bulkInserts, constraints, other } = parseInstallScript();

  console.log(`[3] Mint container SAS`);
  const sas = mintContainerSas();

  await withConnection(DB, async (pool) => {
    console.log(`[4] Run "other" pre-data DDL (${other.length} batches)`);
    for (const batch of other) {
      try {
        await pool.request().batch(batch);
      } catch (err) {
        console.warn(`    SKIP: ${err.message.split("\n")[0]}`);
      }
    }

    console.log(`[5] Run CREATE TABLE (${tableDdl.length} batches)`);
    for (const batch of tableDdl) {
      try {
        await pool.request().batch(batch);
      } catch (err) {
        // 2714 = "There is already an object named X". Idempotent re-run.
        if (err.number === 2714) {
          console.warn(`    SKIP (exists): ${err.message.split("\n")[0]}`);
        } else {
          throw err;
        }
      }
    }

    console.log(`[6] Set up DATABASE SCOPED CREDENTIAL + EXTERNAL DATA SOURCE`);
    // Master key (idempotent)
    await pool.request().batch(`
      IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE symmetric_key_id = 101)
        CREATE MASTER KEY ENCRYPTION BY PASSWORD = '${ADMIN_PASSWORD}!Mk1';`);
    // Drop EXTERNAL DATA SOURCE FIRST (depends on credential), then credential.
    await pool.request().batch(`
      IF EXISTS (SELECT 1 FROM sys.external_data_sources WHERE name = 'AwdwCsvSource')
        DROP EXTERNAL DATA SOURCE AwdwCsvSource;`);
    await pool.request().batch(`
      IF EXISTS (SELECT 1 FROM sys.database_scoped_credentials WHERE name = 'AwdwCsvCred')
        DROP DATABASE SCOPED CREDENTIAL AwdwCsvCred;`);
    await pool.request().batch(`
      CREATE DATABASE SCOPED CREDENTIAL AwdwCsvCred
        WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
        SECRET = '${sas}';`);
    await pool.request().batch(`
      CREATE EXTERNAL DATA SOURCE AwdwCsvSource
        WITH ( TYPE = BLOB_STORAGE,
               LOCATION = 'https://${STORAGE}.blob.core.windows.net/${CSV_CONTAINER}',
               CREDENTIAL = AwdwCsvCred );`);

    // The install script's BULK INSERTs all live in ONE giant batch.
    // The mssql driver's recordset handling can't survive 30 BULK
    // INSERTs in a single batch — split on PRINT 'Loading' boundaries
    // and run each table's BULK INSERT independently so a failure
    // surfaces with the right table name.
    console.log(`[7] BULK INSERT — splitting and running per-table`);
    const rewritten = rewriteBulkInsert(bulkInserts.join("\nGO\n"));
    const subBatches = rewritten
      .split(/PRINT\s+'Loading\s+\[dbo\]\.\[(\w+)\]';/i)
      .reduce((acc, part, i, all) => {
        if (i === 0) return acc; // pre-first-PRINT preamble
        if (i % 2 === 1) acc.push({ table: part, body: all[i + 1] ?? "" });
        return acc;
      }, []);
    let loaded = 0;
    for (const { table, body } of subBatches) {
      if (!/BULK\s+INSERT/i.test(body)) continue;
      const start = Date.now();
      try {
        await pool.request().batch(body);
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`    ${table} loaded in ${sec}s`);
        loaded++;
      } catch (err) {
        const msg = err.message.split("\n")[0];
        console.warn(`    FAIL ${table}: ${msg}`);
      }
    }
    console.log(`    ${loaded}/${subBatches.length} tables loaded`);

    console.log(`[8] Apply constraints + FKs (${constraints.length} batches)`);
    for (const batch of constraints) {
      try {
        await pool.request().batch(batch);
      } catch (err) {
        console.warn(`    SKIP: ${err.message.split("\n")[0]}`);
      }
    }

    console.log(`[9] Smoke test`);
    const r = await pool
      .request()
      .query("SELECT COUNT(*) AS cnt FROM dbo.FactInternetSales");
    console.log(`    FactInternetSales row count: ${r.recordset[0].cnt}`);
  });

  console.log(`✓ Load complete.`);
}

loadDb().catch((err) => {
  console.error(err);
  process.exit(1);
});
