// Shared types used across the Function + frontend SSE event stream.

export type ModelChoice = "azure-openai" | "claude";

export interface ChatRequestBody {
  query: string;
  model: ModelChoice;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  turnstile_token?: string;
}

export interface ChartSpec {
  // Plotly.js figure spec — { data: [...traces], layout: {...} }.
  // Open-ended top-level shape; the frontend renders with react-plotly.js.
  data?: unknown[];
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}

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

export interface ChatLogRow {
  partitionKey: string; // YYYYMM
  rowKey: string;       // <unix_ms>_<random>
  ip_hash: string;
  model: ModelChoice;
  model_id: string;
  query: string;
  generated_sql?: string;
  validation_ok: boolean;
  row_count?: number;
  success: boolean;
  error?: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_est_usd: number;
  timestamp: string;
}
