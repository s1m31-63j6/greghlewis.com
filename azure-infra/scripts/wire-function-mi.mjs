#!/usr/bin/env node
// Add the Function App's system-assigned Managed Identity as a contained
// user in AdventureWorksDW with db_datareader. Runs as the AAD admin
// (the signed-in user) via @azure/identity DefaultAzureCredential.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential } from "@azure/identity";
import sql from "mssql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INFRA = path.resolve(__dirname, "..");
const outputs = JSON.parse(
  fs.readFileSync(path.join(INFRA, "deploy-outputs.json"), "utf8"),
);
const SQL_FQDN = outputs.sqlServerFqdn.value;
const FUNCTION_NAME = outputs.functionAppName.value;

const credential = new DefaultAzureCredential();
const token = await credential.getToken("https://database.windows.net/.default");

const pool = await new sql.ConnectionPool({
  server: SQL_FQDN,
  database: "AdventureWorksDW",
  options: { encrypt: true },
  authentication: {
    type: "azure-active-directory-access-token",
    options: { token: token.token },
  },
  connectionTimeout: 30_000,
  requestTimeout: 60_000,
}).connect();

console.log(`Granting ${FUNCTION_NAME} db_datareader on AdventureWorksDW`);

const stmts = [
  `CREATE USER [${FUNCTION_NAME}] FROM EXTERNAL PROVIDER`,
  `ALTER ROLE db_datareader ADD MEMBER [${FUNCTION_NAME}]`,
  `GRANT VIEW DEFINITION TO [${FUNCTION_NAME}]`,
];

for (const stmt of stmts) {
  try {
    await pool.request().query(stmt);
    console.log(`  ${stmt.split(" ").slice(0, 4).join(" ")}... ok`);
  } catch (err) {
    if (
      err.number === 15023 || // user already exists
      err.message.includes("already exists")
    ) {
      console.log(`  ${stmt.split(" ").slice(0, 4).join(" ")}... already done`);
    } else {
      console.error(`  FAIL: ${err.message}`);
    }
  }
}

const verify = await pool
  .request()
  .input("name", sql.NVarChar, FUNCTION_NAME)
  .query(`
    SELECT u.name, r.name AS role_name
    FROM sys.database_principals u
    JOIN sys.database_role_members m ON m.member_principal_id = u.principal_id
    JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
    WHERE u.name = @name`);
console.log(`Verified roles:`, verify.recordset);

await pool.close();
