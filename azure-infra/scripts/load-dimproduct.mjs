#!/usr/bin/env node
// Special-case loader for DimProduct.csv. The LargePhoto column
// (varbinary(max)) is hex-encoded ASCII but its size still trips up
// Azure SQL's BULK INSERT row-detection. We don't need photos for
// text-to-SQL chat — skip that column entirely.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import sql from "mssql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INFRA = path.resolve(__dirname, "..");
const outputs = JSON.parse(
  fs.readFileSync(path.join(INFRA, "deploy-outputs.json"), "utf8"),
);
const ADMIN_PASSWORD = fs
  .readFileSync(path.join(INFRA, ".sql-admin-password"), "utf8")
  .trim();

// DimProduct schema order — column 25 (0-indexed 24) is LargePhoto.
const COLUMNS = [
  "ProductAlternateKey",
  "ProductSubcategoryKey",
  "WeightUnitMeasureCode",
  "SizeUnitMeasureCode",
  "EnglishProductName",
  "SpanishProductName",
  "FrenchProductName",
  "StandardCost",
  "FinishedGoodsFlag",
  "Color",
  "SafetyStockLevel",
  "ReorderPoint",
  "ListPrice",
  "Size",
  "SizeRange",
  "Weight",
  "DaysToManufacture",
  "ProductLine",
  "DealerPrice",
  "Class",
  "Style",
  "ModelName",
  // LargePhoto skipped — column index 23 in the CSV (after ProductKey at 0)
  "EnglishDescription",
  "FrenchDescription",
  "ChineseDescription",
  "ArabicDescription",
  "HebrewDescription",
  "ThaiDescription",
  "GermanDescription",
  "JapaneseDescription",
  "TurkishDescription",
  "StartDate",
  "EndDate",
  "Status",
];
const LARGEPHOTO_CSV_INDEX = 24; // CSV column 0=ProductKey, 24=LargePhoto

const pool = await new sql.ConnectionPool({
  server: outputs.sqlServerFqdn.value,
  user: "awadmin",
  password: ADMIN_PASSWORD,
  database: "AdventureWorksDW",
  options: { encrypt: true },
  connectionTimeout: 30_000,
  requestTimeout: 120_000,
}).connect();

await pool.request().query("SET IDENTITY_INSERT [dbo].[DimProduct] ON");

const lineStream = readline.createInterface({
  input: fs.createReadStream("/tmp/awdw-scripts/DimProduct.csv", {
    encoding: "utf8",
  }),
  crlfDelay: Infinity,
});

let inserted = 0;
let failed = 0;
const table = new sql.Table("[dbo].[DimProduct]");
table.create = false;
table.columns.add("ProductKey", sql.Int, { nullable: false });
table.columns.add("ProductAlternateKey", sql.NVarChar(25), { nullable: true });
table.columns.add("ProductSubcategoryKey", sql.Int, { nullable: true });
table.columns.add("WeightUnitMeasureCode", sql.NChar(3), { nullable: true });
table.columns.add("SizeUnitMeasureCode", sql.NChar(3), { nullable: true });
table.columns.add("EnglishProductName", sql.NVarChar(50), { nullable: false });
table.columns.add("SpanishProductName", sql.NVarChar(50), { nullable: false });
table.columns.add("FrenchProductName", sql.NVarChar(50), { nullable: false });
table.columns.add("StandardCost", sql.Money, { nullable: true });
table.columns.add("FinishedGoodsFlag", sql.Bit, { nullable: false });
table.columns.add("Color", sql.NVarChar(15), { nullable: false });
table.columns.add("SafetyStockLevel", sql.SmallInt, { nullable: true });
table.columns.add("ReorderPoint", sql.SmallInt, { nullable: true });
table.columns.add("ListPrice", sql.Money, { nullable: true });
table.columns.add("Size", sql.NVarChar(50), { nullable: true });
table.columns.add("SizeRange", sql.NVarChar(50), { nullable: true });
table.columns.add("Weight", sql.Float, { nullable: true });
table.columns.add("DaysToManufacture", sql.Int, { nullable: true });
table.columns.add("ProductLine", sql.NChar(2), { nullable: true });
table.columns.add("DealerPrice", sql.Money, { nullable: true });
table.columns.add("Class", sql.NChar(2), { nullable: true });
table.columns.add("Style", sql.NChar(2), { nullable: true });
table.columns.add("ModelName", sql.NVarChar(50), { nullable: true });
table.columns.add("LargePhoto", sql.VarBinary(sql.MAX), { nullable: true });
table.columns.add("EnglishDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("FrenchDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("ChineseDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("ArabicDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("HebrewDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("ThaiDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("GermanDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("JapaneseDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("TurkishDescription", sql.NVarChar(400), { nullable: true });
table.columns.add("StartDate", sql.DateTime, { nullable: true });
table.columns.add("EndDate", sql.DateTime, { nullable: true });
table.columns.add("Status", sql.NVarChar(7), { nullable: true });

function parseValue(raw, type) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null;
  if (type === "int" || type === "smallint") {
    const n = parseInt(trimmed, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (type === "float" || type === "money") {
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? null : n;
  }
  if (type === "bit") return trimmed === "1" || trimmed.toLowerCase() === "true";
  if (type === "datetime") {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return trimmed;
}

for await (const line of lineStream) {
  if (!line.trim()) continue;
  const fields = line.split("|");
  // Good rows have 36 columns. Anything else is a fragment of the
  // adjacent row's binary LargePhoto data, which the install script's
  // ROWTERMINATOR='\n' incorrectly split on. Skip those.
  if (fields.length !== 36) {
    failed++;
    continue;
  }
  try {
    const productKey = parseValue(fields[0], "int");
    const row = [
      productKey,
      parseValue(fields[1], "nvarchar"),
      parseValue(fields[2], "int"),
      parseValue(fields[3], "nchar"),
      parseValue(fields[4], "nchar"),
      parseValue(fields[5], "nvarchar"),
      parseValue(fields[6], "nvarchar"),
      parseValue(fields[7], "nvarchar"),
      parseValue(fields[8], "money"),
      parseValue(fields[9], "bit"),
      parseValue(fields[10], "nvarchar"),
      parseValue(fields[11], "smallint"),
      parseValue(fields[12], "smallint"),
      parseValue(fields[13], "money"),
      parseValue(fields[14], "nvarchar"),
      parseValue(fields[15], "nvarchar"),
      parseValue(fields[16], "float"),
      parseValue(fields[17], "int"),
      parseValue(fields[18], "nchar"),
      parseValue(fields[19], "money"),
      parseValue(fields[20], "nchar"),
      parseValue(fields[21], "nchar"),
      parseValue(fields[22], "nvarchar"),
      null, // LargePhoto — skipped
      parseValue(fields[25], "nvarchar"),
      parseValue(fields[26], "nvarchar"),
      parseValue(fields[27], "nvarchar"),
      parseValue(fields[28], "nvarchar"),
      parseValue(fields[29], "nvarchar"),
      parseValue(fields[30], "nvarchar"),
      parseValue(fields[31], "nvarchar"),
      parseValue(fields[32], "nvarchar"),
      parseValue(fields[33], "nvarchar"),
      parseValue(fields[34], "datetime"),
      parseValue(fields[35], "datetime"),
      parseValue(fields[36], "nvarchar"),
    ];
    table.rows.add(...row);
    inserted++;
  } catch (e) {
    failed++;
  }
}

console.log(`Parsed ${inserted} rows, ${failed} failed.`);
try {
  const result = await pool.request().bulk(table, { keepNulls: true });
  console.log(`Bulk inserted ${result.rowsAffected} rows.`);
} catch (e) {
  console.log("Bulk insert failed:", e.message);
}

const verify = await pool
  .request()
  .query("SELECT COUNT(*) AS cnt FROM [dbo].[DimProduct]");
console.log(`DimProduct row count: ${verify.recordset[0].cnt}`);

await pool.close();
