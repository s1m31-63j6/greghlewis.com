export type PuzzleExample = {
  kind: "puzzle";
  puzzle_id: string;
  /** Position to present — already advanced past the opponent's setup move. */
  fen: string;
  /** Alternating solver / opponent moves, starting with the solver. */
  solution_uci: string[];
  solution_san: string[];
  rating: number;
  themes: string[];
  game_url: string;
};

export type PositionExample = {
  kind: "position";
  fen: string;
  /** SAN moves that produced the position, when it came from an opening line. */
  moves_san: string[];
  caption: string;
};

export type Example = PuzzleExample | PositionExample;

export type Category = "tactics" | "endgame" | "strategy";

export type Concept = {
  slug: string;
  name: string;
  category: Category;
  one_liner: string;
  teaching: string;
  source: "lichess" | "authored";
  examples: Example[];
};

export type Library = { concepts: Concept[] };

/** One accent per category, from the same palette as the rest of the project. */
export const CATEGORY_STYLE: Record<Category, { label: string; icon: string; colour: string }> = {
  tactics: { label: "Tactics", icon: "⚡", colour: "#FF9600" },
  endgame: { label: "Endgame", icon: "👑", colour: "#CE82FF" },
  strategy: { label: "Strategy", icon: "🧭", colour: "#1CB0F6" },
};
