#!/usr/bin/env node
// Manual probe: try ONE BULK INSERT against the existing tables and
// dump the full error.

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
const ADMIN_PASSWORD = fs
  .readFileSync(path.join(INFRA, ".sql-admin-password"), "utf8")
  .trim();

const config = {
  server: SQL_FQDN,
  user: "awadmin",
  password: ADMIN_PASSWORD,
  database: "AdventureWorksDW",
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 30_000,
  requestTimeout: 600_000,
};

const pool = await new sql.ConnectionPool(config).connect();

console.log("=== Inspecting external data source ===");
const ds = await pool.request().query(
  "SELECT name, location, credential_id FROM sys.external_data_sources",
);
console.log(ds.recordset);

console.log("\n=== Inspecting blob URL with curl ===");
// Mint a quick SAS and test direct fetch
const d = new Date(Date.now() + 60 * 60 * 1000);
const expiry =
  `${d.getUTCFullYear()}-` +
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}-` +
  `${String(d.getUTCDate()).padStart(2, "0")}T` +
  `${String(d.getUTCHours()).padStart(2, "0")}:` +
  `${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
const accountKey = execSync(
  `az storage account keys list --account-name ${STORAGE} --query "[0].value" -o tsv`,
  { encoding: "utf8" },
).trim();
const sasToken = execSync(
  `az storage container generate-sas --account-name ${STORAGE} --account-key '${accountKey}' --name awdw-csv --permissions rl --expiry ${expiry} --https-only -o tsv`,
  { encoding: "utf8" },
).trim();
const testUrl = `https://${STORAGE}.blob.core.windows.net/awdw-csv/DimAccount.csv?${sasToken}`;
console.log("Probing:", testUrl.slice(0, 100), "...");
try {
  const probe = execSync(`curl -sI "${testUrl}" | head -3`, {
    encoding: "utf8",
  });
  console.log(probe);
} catch (e) {
  console.log("curl failed:", e.message);
}

console.log("\n=== Truncating DimAccount and attempting BULK INSERT ===");
try {
  await pool.request().batch("TRUNCATE TABLE [dbo].[DimAccount]");
} catch (err) {
  console.log("truncate skip:", err.message.split("\n")[0]);
}

const bulkSql = `
BULK INSERT [dbo].[DimAccount] FROM 'DimAccount.csv'
WITH (
    DATA_SOURCE = 'AwdwCsvSource',
    CODEPAGE = '65001',
    DATAFILETYPE = 'char',
    FIELDTERMINATOR = '|',
    ROWTERMINATOR = '0x0a',
    KEEPIDENTITY,
    TABLOCK
);
SELECT COUNT(*) AS cnt FROM [dbo].[DimAccount];
`;
try {
  const r = await pool.request().batch(bulkSql);
  console.log("BULK INSERT succeeded. recordsets:", r.recordsets);
} catch (err) {
  console.log("BULK INSERT failed:");
  console.log("  number:", err.number);
  console.log("  state:", err.state);
  console.log("  class:", err.class);
  console.log("  message:", err.message);
  console.log("  procName:", err.procName);
  console.log("  lineNumber:", err.lineNumber);
  if (err.precedingErrors?.length > 0) {
    console.log("  precedingErrors:");
    for (const pe of err.precedingErrors) {
      console.log(`    [${pe.number}] ${pe.message}`);
    }
  }
}

await pool.close();
