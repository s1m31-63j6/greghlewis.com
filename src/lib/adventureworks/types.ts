// Frontend types — mirror the Function's SSE event union so the chat
// consumer is fully typed end-to-end.

export type ModelChoice = "azure-openai" | "claude";

export type ChartSpec = {
  $schema?: string;
  [key: string]: unknown;
};

export interface ModelMeta {
  model: ModelChoice;
  model_id: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_est_usd: number;
}

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "sql"; sql: string }
  | { type: "validation"; ok: boolean; errors?: string[] }
  | { type: "rows"; columns: string[]; rows: unknown[][]; row_count: number }
  | { type: "narrative"; content: string }
  | { type: "chart"; spec: ChartSpec }
  | { type: "meta"; meta: ModelMeta }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;            // user text OR assistant narrative
  status?: string;            // last status message ("Generating SQL…" etc)
  sql?: string;
  validation?: { ok: boolean; errors?: string[] };
  table?: { columns: string[]; rows: unknown[][]; row_count: number };
  chart?: ChartSpec;
  meta?: ModelMeta;
  errored?: string;
}

export interface PbiEmbed {
  state: "Active";
  token: string;
  expiration: string;
  embedUrl: string;
  reportId: string;
}

export type PbiState =
  | "Active"
  | "Paused"
  | "Resuming"
  | "Pausing"
  | "Unknown";
