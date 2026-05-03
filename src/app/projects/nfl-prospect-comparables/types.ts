export type Position = "QB" | "RB" | "WR" | "TE";

export type Cohort =
  | "training_2014_2020"
  | "validation_2021_2025"
  | "prediction_2026";

export type OutcomeClass =
  | "Bust"
  | "Role Player"
  | "Starter"
  | "Pro Bowl"
  | "HOF-track";

export interface Bio {
  college: string | null;
  height_in: number | null;
  weight_lb: number | null;
  age_at_draft: number | null;
  hand_size_in: number | null;
  arm_length_in: number | null;
  hometown_state: string | null;
}

// Combine + pro-day measurables. Populated from nflverse/combine for
// historical players and (partial) 2026 prospects. The Stats panel
// renders this block alongside or in place of NFL outcome stats — for
// prospects who haven't played a snap, combine results stand in.
export interface Athletic {
  forty_yard: number | null;
  vertical_in: number | null;
  broad_jump_in: number | null;
  three_cone: number | null;
  shuttle: number | null;
  bench_reps: number | null;
}

export interface DraftInfo {
  year: number | null;
  round: number | null;
  pick: number | null;
  team: string | null;
  team_logo_url: string | null;
}

export interface TraitScore {
  score: number | null;
  quote: string | null;
}

export type TraitMap = Record<string, TraitScore>;

export interface CompNode {
  id: string;
  name: string;
  position: Position;
  cohort: Cohort;
  visible_in_graph: boolean;
  highlight: boolean;
  x: number | null;
  y: number | null;
  z: number | null;
  outcome_class: OutcomeClass | null;
  career_av: number | null;
  peak_av: number | null;
  pro_bowls: number | null;
  bio: Bio;
  draft: DraftInfo;
  athletic: Athletic;
  headshot_candidates: string[];
  traits: TraitMap | null;
}

export interface CompEdge {
  source: string;
  target: string;
  similarity: number;
  per_layer: Partial<Record<"BODY" | "VOLUME" | "EFFICIENCY" | "DRAFT" | "TRAITS", number>>;
  in_graph: boolean;
}

export interface CompGraphMeta {
  generated_at: string;
  pool_size: number;
  visible_cohorts: Cohort[];
  all_cohorts: Cohort[];
  top_k_edges: number;
  weights_used: Record<Position, Record<string, number>>;
  position_offsets_3d: Record<Position, [number, number, number]>;
}

export interface CompGraphData {
  meta: CompGraphMeta;
  nodes: CompNode[];
  edges: CompEdge[];
}

// Editorial palette — deep, slightly muted tones meant to read clearly on a
// cream/white canvas. Inspired by The Economist / FiveThirtyEight long-form
// charts: navy, claret, ochre, forest. Each value still has enough chroma
// that the four positions read as distinct at small node sizes.
export const POSITION_COLORS: Record<Position, string> = {
  QB: "#1B4F7A", // deep navy
  RB: "#7C2A4E", // claret / mulberry
  WR: "#B86705", // burnt ochre
  TE: "#3F6A38", // forest
};

// Display aliases for the longer trait keys. Falls back to spaced-key for
// anything not listed.
const TRAIT_LABEL_ALIASES: Record<string, string> = {
  accuracy_short: "Short acc.",
  accuracy_intermediate: "Mid-range acc.",
  accuracy_deep: "Deep acc.",
  arm_strength: "Arm strength",
  decision_making: "Decisions",
  pocket_presence: "Pocket",
  processing_speed: "Processing",
  breakaway_speed: "Breakaway",
  contact_balance: "Balance",
  pass_protection: "Pass pro",
  receiving_chops: "Receiving",
  three_down_versatility: "3-down",
  workload_durability: "Durability",
  contested_catch: "Contested",
  hands_consistency: "Hands",
  physicality_blocking: "Physicality",
  route_tree_breadth: "Route tree",
  separation_quickness: "Separation",
  slot_outside_versatility: "Slot/outside",
  vertical_speed: "Vertical",
  yac_ability: "YAC",
  blocking_in_space: "In-space block",
  blocking_inline: "Inline block",
  formation_versatility: "Versatility",
  receiving_radius: "Radius",
};

export function prettyTraitLabel(key: string): string {
  return (
    TRAIT_LABEL_ALIASES[key] ??
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export type PositionTraitAverages = Partial<Record<Position, Record<string, number>>>;
