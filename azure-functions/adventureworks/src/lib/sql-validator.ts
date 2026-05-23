// AST-level validation for model-generated SQL. The read-only DB user
// (db_datareader on dbo only) is the primary defense; this catches the
// rest — multi-statement injection, system-table reads, missing
// cardinality cap.

import { Parser } from "node-sql-parser";

const parser = new Parser();

const ALLOWED_TABLES = new Set<string>([
  // Facts
  "FactInternetSales",
  "FactResellerSales",
  "FactProductInventory",
  "FactCallCenter",
  "FactSurveyResponse",
  "FactCurrencyRate",
  "FactFinance",
  "FactSalesQuota",
  "FactInternetSalesReason",
  // Dimensions
  "DimDate",
  "DimCustomer",
  "DimGeography",
  "DimProduct",
  "DimProductSubcategory",
  "DimProductCategory",
  "DimSalesTerritory",
  "DimReseller",
  "DimEmployee",
  "DimPromotion",
  "DimCurrency",
  "DimAccount",
  "DimOrganization",
  "DimDepartmentGroup",
  "DimScenario",
  "DimSalesReason",
]);

// Substring denylist applied BEFORE parsing — these are dangerous enough
// that even a quoted occurrence is suspicious. Statement-level damage
// like xp_cmdshell, OPENROWSET, BULK INSERT, system schema access.
const DENYLIST = [
  "xp_",
  "sp_executesql",
  "openrowset",
  "openquery",
  "opendatasource",
  "bulk insert",
  "sys.",
  "information_schema",
  "@@",
  "exec(",
  "execute(",
  "into outfile",
  "into dumpfile",
];

const MAX_ROWS = 500;

export interface ValidationResult {
  ok: boolean;
  /** SQL ready to execute (semicolon stripped, no other transformation). */
  normalizedSql?: string;
  errors?: string[];
}

export function validateSql(rawSql: string): ValidationResult {
  if (!rawSql || typeof rawSql !== "string") {
    return { ok: false, errors: ["No SQL provided"] };
  }

  // Strip ONE trailing semicolon (allowed). Anything more = multi-statement.
  let sql = rawSql.trim();
  if (sql.endsWith(";")) sql = sql.slice(0, -1).trim();
  if (sql.includes(";")) {
    return { ok: false, errors: ["Multi-statement queries are not allowed."] };
  }

  // Substring denylist — case-insensitive scan.
  const lower = sql.toLowerCase();
  for (const pat of DENYLIST) {
    if (lower.includes(pat)) {
      return { ok: false, errors: [`Disallowed pattern: ${pat}`] };
    }
  }

  // Parse — node-sql-parser with transactsql dialect.
  let astRaw: unknown;
  try {
    astRaw = parser.astify(sql, { database: "transactsql" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`SQL parse error: ${msg}`] };
  }
  const ast = Array.isArray(astRaw) ? astRaw[0] : astRaw;
  if (!ast || typeof ast !== "object") {
    return { ok: false, errors: ["Unparseable SQL"] };
  }

  const stmtType = (ast as { type?: string }).type;
  if (stmtType !== "select") {
    return {
      ok: false,
      errors: [`Only SELECT statements are allowed (got: ${stmtType ?? "unknown"})`],
    };
  }

  // Table allowlist via parser.tableList — returns "<op>::<schema>::<table>".
  let tableList: string[];
  try {
    tableList = parser.tableList(sql, { database: "transactsql" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`Table extraction failed: ${msg}`] };
  }
  for (const entry of tableList) {
    const [op, , tableName] = entry.split("::");
    if (op !== "select") {
      return {
        ok: false,
        errors: [`Disallowed operation '${op}' on ${tableName}`],
      };
    }
    if (!ALLOWED_TABLES.has(tableName)) {
      return { ok: false, errors: [`Disallowed table: ${tableName}`] };
    }
  }

  // Cardinality cap — must have TOP, LIMIT, or OFFSET/FETCH.
  if (!hasRowLimit(sql)) {
    return {
      ok: false,
      errors: [
        `Query must include TOP N (N ≤ ${MAX_ROWS}) or OFFSET ... FETCH NEXT ${MAX_ROWS} ROWS ONLY.`,
      ],
    };
  }

  return { ok: true, normalizedSql: sql };
}

function hasRowLimit(sql: string): boolean {
  // Cheap regex check — the parser already established this is a SELECT,
  // so a TOP/LIMIT/FETCH token anywhere in the statement is meaningful.
  const cleaned = sql.replace(/\s+/g, " ");
  if (/\bTOP\s+\d+\b/i.test(cleaned)) return true;
  if (/\bLIMIT\s+\d+\b/i.test(cleaned)) return true;
  if (/\bFETCH\s+NEXT\s+\d+\s+ROWS?\s+ONLY\b/i.test(cleaned)) return true;
  return false;
}
