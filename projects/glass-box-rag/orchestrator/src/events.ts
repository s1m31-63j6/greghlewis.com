/**
 * The SSE event protocol. Imported by BOTH the Lambda and the frontend, so the
 * pipeline visualization can never drift from what the pipeline actually emits.
 *
 * Every stage carries its real intermediate artifact, not just a status string.
 * The right-hand panel is a trace of what happened, not a re-enactment of it.
 */

export interface RankedDoc {
  chunk_id: string;
  case_id: string;
  case_name: string;
  court: string;
  court_level: string;
  year: number;
  section: string | null;
  score: number;
  snippet: string;
  /** Rank in the previous stage, so the UI can animate the reshuffle. */
  prev_rank?: number;
}

export type StageName =
  | "analyze"
  | "transform"
  | "retrieve_sparse"
  | "retrieve_dense"
  | "fuse"
  | "temporal"
  | "rerank"
  | "diversify"
  | "assess"
  | "hop"
  | "synthesize";

export type StreamEvent =
  /** A stage began. The UI lights the node. */
  | { type: "stage_start"; stage: StageName; hop: number; label: string }
  /** A stage finished, with its timing and its real output. */
  | {
      type: "stage_end";
      stage: StageName;
      hop: number;
      ms: number;
      docs?: RankedDoc[];
      detail?: Record<string, unknown>;
    }
  /** Question analysis: intent, temporal scope, doctrinal factors. */
  | {
      type: "analysis";
      intent: string;
      as_of: number | null;
      factors: string[];
      reasoning: string;
    }
  /** Query transformation artifacts — the HyDE passage and query variants. */
  | { type: "transform"; hyde: string; variants: string[] }
  /** The agent decided whether it has enough, and why. */
  | {
      type: "assessment";
      hop: number;
      sufficient: boolean;
      reasoning: string;
      follow: { case_id: string; case_name: string; why: string }[];
    }
  /** Streaming answer tokens. */
  | { type: "text"; content: string }
  /** Final citations actually used. */
  | { type: "citations"; cases: { case_id: string; case_name: string; citation: string | null }[] }
  | { type: "meta"; total_ms: number; hops: number; input_tokens?: number; output_tokens?: number }
  | { type: "done" }
  | { type: "error"; message: string };
