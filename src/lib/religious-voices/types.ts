// Shared types for the religious-voices project. The corpus JSON file
// produced by the Python pipeline conforms to these shapes; both the
// retrieval layer and the frontend read against them.

export interface Leader {
  leader_id: string;
  religion: Religion;
  full_name: string;
  role: string;
  dates: string;
  era_start: number;
  themes: string[];
}

export type Religion =
  | "Mormon"
  | "Catholic"
  | "Methodist"
  | "Southern Baptist"
  | "Jewish"
  | "Buddhist"
  | "Islam"
  | "Hindu";

export interface Chunk {
  id: string;
  leader_id: string;
  religion: Religion;
  year: number | null;
  work_title: string;
  source_url: string;
  text: string;
  embedding: number[];
}

export interface CorpusMeta {
  leaders: Leader[];
  generated_at: string;
}

export interface Corpus {
  chunks: Chunk[];
  generated_at: string;
}
