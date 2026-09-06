import type { Params } from "./types.ts";

/** Collapse every `{value, source, ...}` leaf to its value. */
export function plain(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(plain);
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if ("value" in o && "source" in o) return o.value;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = plain(o[k]);
    return out;
  }
  return obj;
}

export interface SourcedRow {
  path: string; value: unknown; source: string; kind: string; url?: string; note?: string;
}

/** One row per sourced leaf, for the methodology table. */
export function flatten(obj: unknown, prefix = ""): SourcedRow[] {
  const rows: SourcedRow[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => rows.push(...flatten(v, `${prefix}[${i}]`)));
  } else if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if ("value" in o && "source" in o) {
      rows.push({ path: prefix, ...(o as Omit<SourcedRow, "path">) });
    } else {
      for (const k of Object.keys(o)) rows.push(...flatten(o[k], prefix ? `${prefix}.${k}` : k));
    }
  }
  return rows;
}

export function loadParams(raw: unknown): Params {
  return plain(raw) as Params;
}
