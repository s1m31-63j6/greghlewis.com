/**
 * The playbook type model.
 *
 * The one idea everything follows from: **a play is never stored as
 * coordinates.** A play is a sentence in a small vocabulary — a formation
 * reference, a per-slot assignment for each player, and some tags — and every
 * coordinate is derived from that sentence by `resolvePlay`. Hand-placing x/y
 * for 250 plays across three team sizes is infeasible and unmaintainable; a
 * compositional spec is roughly thirty lines of data per play and mirrors,
 * rescales, and re-fits itself to any field variant for free.
 *
 * Two coordinate spaces, and only two:
 *   - **Data is yards**, floating point, origin at the ball, +y downfield,
 *     +x the offense's right. Nothing in this file is ever a pixel.
 *   - **SVG is tenths of a yard**, integers, y increasing downward. The two
 *     conversion lines live in field.ts and nowhere else.
 */

// ─── primitives ─────────────────────────────────────────────────────────────

/** A point in yards, relative to the ball at the middle of the LOS. */
export interface Vec {
  x: number;
  y: number;
}

/** Yards. Named so signatures read as measurements rather than magnitudes. */
export type Yards = number;

export type PathStyle = "solid" | "dashed" | "dotted" | "zigzag";
export type EndCap = "arrow" | "tbar" | "dot" | "none";
export type CurveMode = "spline" | "polyline";
export type Corner = "sharp" | "round";

/**
 * Every position a player can occupy. `T` is deliberately absent as a skill
 * label — it collides with the tackle, which is the single most common source
 * of confusion in published playbooks.
 */
export type SlotId =
  | "QB" | "C" | "LG" | "RG" | "LT" | "RT"
  | "RB" | "FB" | "A1" | "A2"
  | "X" | "Z" | "Y" | "H" | "F" | "V";

export type Side = "L" | "R";

/**
 * Authoring uses playside/backside, never left/right. That is what makes
 * Power Right and Power Left the same data with one sign flipped.
 */
export type RelSide = "playside" | "backside";
export type GapLetter = "A" | "B" | "C" | "D";
export type GapId = `${RelSide}-${GapLetter}`;

// ─── field ──────────────────────────────────────────────────────────────────

export type FieldVariantId = "11man" | "9man" | "8man" | "7man" | "5flag";

export type SplitName =
  | "wide" | "plus" | "slot" | "nasty" | "wing" | "tight" | "attached";

/**
 * One row per team size. This is the only place in the codebase that knows how
 * big a field is or how many bodies are on it.
 *
 * `depthScale` and `widthScale` are the whole answer to "how does a 12-yard dig
 * become a flag route": routes are authored once against the 11-man field and
 * multiplied. 12 x 0.65 = 7.8 yards, which is right for a seven-second clock.
 * Two scalars per variant replace a per-route-per-variant table.
 */
export interface FieldVariant {
  id: FieldVariantId;
  label: string;
  playersPerSide: number;
  widthYd: Yards;
  /**
   * How much field the DIAGRAM shows. Narrower than the real field on the
   * tackle variants, because a play uses about thirty yards of a fifty-three
   * yard field and drawing the other twenty-three makes everything tiny. Every
   * playbook product crops this way; the full width is still the fact that
   * governs whether a player is out of bounds.
   */
  viewWidthYd: Yards;
  /** How much field the diagram shows downfield and behind, from the LOS. */
  window: { behindYd: Yards; aheadYd: Yards };
  /** Linemen. Flag has one (the center) and no blocking. */
  line: { count: number; splitYd: Yards };
  /** Body budget for backs + receivers, after the line and the QB. */
  skillCount: number;
  depthScale: number;
  widthScale: number;
  maxRouteDepthYd: Yards;
  /** Distance between the two hash rows. Null where the variant has no hashes. */
  hashSeparationYd: Yards | null;
  splits: Record<SplitName, Yards>;
  presumedFront: string;
  /** False for flag, which has no blocking at all. */
  blockingLegal: boolean;
  /** Base receiver speed, yards per second, for animation timing. */
  defaultSpeedYps: number;
  /** Flag only: bands where a run is illegal and a forward pass is mandatory. */
  noRunZones?: { fromYd: Yards; toYd: Yards; label: string }[];
  /** Flag only: how far behind the LOS a rusher must start. */
  rushLineYd?: Yards;
  /** Flag only: seconds the QB has before the play is dead. */
  passClockSec?: number;
}

// ─── formations ─────────────────────────────────────────────────────────────

export type QBAlign = "under" | "gun" | "pistol";
export type BackAlign =
  | "i" | "offset" | "dot" | "split" | "wing" | "slot" | "diamond" | "pistol";

export interface ReceiverSpot {
  slot: SlotId;
  side: Side;
  /** 1 is outermost. Used for coverage rules, which count from the sideline in. */
  order: 1 | 2 | 3 | 4;
  split: SplitName;
  /** Legality on the tackle variants; ignored where there is no line. */
  onLine: boolean;
  /**
   * Depth override. Only a stack needs it — two receivers at the same split
   * with one behind the other, which the splits table alone cannot express.
   */
  depthYd?: Yards;
  /** 1 is kept first when a variant has fewer bodies than the formation wants. */
  priority: number;
}

export interface BackSpot {
  slot: SlotId;
  align: BackAlign;
  side: Side | "mid";
  depthYd?: Yards;
  priority: number;
}

export interface Formation {
  id: string;
  /** Display name. Generated names beat stored ones, but coaches know these. */
  name: string;
  aliases: string[];
  /** Two digits, RBs then TEs. WRs = 5 - (RB + TE). Tackle variants only. */
  personnelId?: string;
  /** Canonical strength. The other side is `flip`, never a second formation. */
  strength: Side;
  qb: { align: QBAlign; depthYd?: Yards };
  backs: BackSpot[];
  receivers: ReceiverSpot[];
  tags: string[];
  variantScope?: FieldVariantId[];
  /** Escape hatch. Should appear on well under a tenth of formations. */
  variantOverrides?: Partial<Record<FieldVariantId, Partial<Formation>>>;
}

// ─── routes ─────────────────────────────────────────────────────────────────

/**
 * The 0-9 tree plus the named routes. One library, one mechanism — there is
 * deliberately no second system for the non-tree routes.
 *
 * Numbering is not universal across programs, which is why a route is stored
 * by id and carries its tree number as metadata rather than being a bare digit.
 */
export type RouteId =
  | "hitch" | "flat" | "slant" | "comeback" | "curl"
  | "out" | "dig" | "corner" | "post" | "go"
  | "shallow" | "mesh" | "wheel" | "whip" | "bubble" | "swing" | "sail"
  | "drag" | "seam" | "stick" | "glance" | "chair" | "pivot" | "arrow"
  | "texas" | "stalk" | "crack" | "screen" | "checkdown" | "wall";

export interface RouteDef {
  id: RouteId;
  treeNumber?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  label: string;
  /**
   * Ordered points in route-local yards, where +x means OUTWARD (toward the
   * receiver's nearest sideline) and +y is downfield. Because outward is
   * derived from the resolved start position, flipping a play needs no
   * route-level handling at all.
   */
  points: Vec[];
  curve: CurveMode;
  cap: EndCap;
  style: PathStyle;
  /** What `mods.depth` rescales against. */
  nominalDepthYd: Yards;
  /** Seconds to run it at nominal depth, before any speed multiplier. */
  nominalSeconds: number;
  tags: string[];
}

export interface RouteMods {
  /** Absolute rescale of nominalDepthYd. */
  depth?: Yards;
  /** Additive adjustment, applied before the rescale. */
  depthAdj?: Yards;
  toSide?: Side | RelSide;
  release?: "inside" | "outside" | "stack" | "free";
  /**
   * The one relational mod. Two shallows cannot be independent point lists or
   * they overlap; a mutually-meshed pair gets pulled to a common crossing
   * point by the resolver.
   */
  meshWith?: SlotId;
  meshDepthYd?: Yards;
  lane?: "over" | "under";
  landmark?: "numbers" | "hash" | "sideline" | "middle";
  /** Sit-down distance for a route that settles rather than running through. */
  settleYd?: Yards;
}

export interface OptionRoute {
  read: "leverage" | "man-or-zone" | "safety-count" | "flat-defender";
  /** Branches nest exactly one level. Two levels is a flowchart. */
  branches: { when: string; route: RouteId; mods?: RouteMods }[];
}

// ─── blocking ───────────────────────────────────────────────────────────────

export type BlockRuleName =
  | "base" | "down" | "back" | "reach" | "scoop" | "combo" | "climb"
  | "kickout" | "log" | "wrap" | "skip-pull" | "trap" | "hinge" | "fan"
  | "slide" | "pass-set" | "stalk" | "crack" | "seal" | "arc";

export interface BlockRule {
  block: BlockRuleName;
  target?: GapId | SlotId | "EMLOS" | "PSLB" | "BSLB" | "first-level" | "second-level";
  /** Combo partner. */
  with?: SlotId;
  path?: "wrap" | "skip" | "log" | "flat";
}

/** Relative line positions. A pull is not a separate concept — it is a rule. */
export type LineSlot = "PST" | "PSG" | "C" | "BSG" | "BST" | "*";

export interface BlockingScheme {
  id: string;
  name: string;
  kind: "zone" | "gap" | "man" | "pass";
  rules: Partial<Record<LineSlot, BlockRule>>;
  combos?: [LineSlot, LineSlot][];
  notes?: string;
}

// ─── assignments ────────────────────────────────────────────────────────────

export interface MotionSpec {
  type: "jet" | "orbit" | "shift" | "across" | "return";
  toSplit?: SplitName;
  toSide?: Side;
  /** Motion lives in negative time; the snap is t = 0. */
  startMsBeforeSnap: number;
  atSnap: "moving" | "set";
}

export interface TimingOverride {
  startDelayMs?: number;
  speedYps?: number;
  /**
   * Doubles as animation staging and the progression badge number. Also the
   * answer to flag's crossing-route collisions, which NFL FLAG's own playbook
   * warns about and no competitor models.
   */
  priorityOrder?: number;
}

export type Assignment =
  | {
      kind: "route";
      route: RouteId;
      mods?: RouteMods;
      option?: OptionRoute;
      style?: PathStyle;
      cap?: EndCap;
      timing?: TimingOverride;
    }
  | { kind: "block"; rule: BlockRule; timing?: TimingOverride }
  | {
      kind: "carry";
      aim: GapId;
      press?: GapId;
      path?: "downhill" | "stretch" | "counter-step" | "dive";
      timing?: TimingOverride;
    }
  | {
      kind: "pass";
      drop: "1step" | "3step" | "5step" | "7step" | "gun-quick" | "gun-3" | "sprint" | "boot";
      fake?: SlotId;
      timing?: TimingOverride;
    }
  | { kind: "pitch"; to: SlotId; timing?: TimingOverride }
  | { kind: "motion"; motion: MotionSpec; then: Assignment }
  | { kind: "none" };

// ─── defense ────────────────────────────────────────────────────────────────

/** Alignment numbering is to the defensive line what splits are to receivers. */
export type Technique =
  | "0" | "1" | "2i" | "2" | "3" | "4i" | "4" | "5" | "6" | "7" | "9";

export interface FrontSpot {
  slot: string;
  technique?: Technique;
  /** Which offensive lineman the technique is measured against. */
  over?: "C" | "G" | "T" | "TE";
  side: Side | "mid";
  depthYd: Yards;
  lateralYd?: Yards;
  priority: number;
}

export interface DefensiveFront {
  id: string;
  name: string;
  aliases: string[];
  spots: FrontSpot[];
  variantScope: FieldVariantId[];
  tags: string[];
}

export type ZoneLandmark =
  | "flat" | "curl" | "curl-flat" | "hook" | "hook-curl" | "middle-hook"
  | "seam-curl-flat" | "deep-third" | "deep-half" | "deep-quarter"
  | "deep-middle" | "low-hole" | "robber";

export interface Zone {
  id: string;
  shape: "ellipse" | "rect" | "wedge";
  landmark: ZoneLandmark;
  side?: Side | "mid";
  depthYd?: Yards;
  ownerSlot?: string;
  label?: string;
}

export interface Coverage {
  id: string;
  name: string;
  /** The number in "Cover N" is the count of deep defenders. */
  deepDefenders: 0 | 1 | 2 | 3 | 4;
  kind: "man" | "zone" | "match" | "split-field";
  /** slot -> the receiver number he carries, counting from the sideline in. */
  manAssignments?: Record<string, 1 | 2 | 3 | 4 | "back" | "spy">;
  zones?: Zone[];
  aliases: string[];
  variantScope: FieldVariantId[];
  tags: string[];
  notes?: string;
}

export interface Pressure {
  id: string;
  name: string;
  /** slot -> the gap he is attacking. */
  blitzers: Record<string, GapId>;
  coverageId: string;
  aliases: string[];
  tags: string[];
}

// ─── reads ──────────────────────────────────────────────────────────────────

export type OutcomeRef =
  | { give: SlotId }
  | { keep: "QB" }
  | { pitch: SlotId }
  | { throw: SlotId };

export interface Read {
  order: number;
  type:
    | "progression" | "rpo-pre" | "rpo-post"
    | "option-dive" | "option-pitch" | "zone-read";
  /** Who is being read. Drawn as a ghost defender plus a dotted read line. */
  key: string;
  keySide?: RelSide;
  progression?: SlotId[];
  ifTake?: OutcomeRef;
  ifNot?: OutcomeRef;
}

// ─── diagram extras ─────────────────────────────────────────────────────────

export interface Annotation {
  id: string;
  kind: "text" | "arrow" | "bracket" | "circle" | "ghost-defender";
  at: Vec;
  to?: Vec;
  text?: string;
  style?: PathStyle;
  colorRole?: "note" | "warn" | "key";
}

export interface BallPathSpec {
  segments: {
    from: SlotId | Vec;
    to: SlotId | Vec;
    kind: "snap" | "handoff" | "pitch" | "pass" | "carry";
    arcHeight?: number;
    branchId?: string;
  }[];
}

// ─── the play ───────────────────────────────────────────────────────────────

export type PlayFamily =
  | "run" | "pass" | "rpo" | "screen" | "play-action" | "option" | "trick"
  | "front" | "coverage" | "pressure";

export type PhilosophyId =
  | "air-raid" | "power-gap" | "zone-run" | "pro-west-coast" | "spread-rpo"
  | "flexbone" | "wing-t" | "flag"
  | "defense-front" | "defense-coverage" | "defense-pressure";

/**
 * Search facet for the intended target. `FV` is the F-back / fullback — note
 * the documented collision, where Air Raid books call the running back F and
 * pro-style books mean the fullback.
 */
export type TargetRole = "QB" | "RB" | "FV" | "TE" | "XWR" | "ZWR" | "SLOT" | "CTR";

export type SituationTag =
  // down & distance
  | "1st-down" | "2nd-short" | "2nd-long" | "3rd-short" | "3rd-medium"
  | "3rd-long" | "4th-short" | "short-yardage" | "long-yardage"
  // field zone
  | "backed-up" | "own-territory" | "midfield" | "plus-territory"
  | "red-zone" | "goal-line" | "no-run-zone"
  // game state
  | "two-minute" | "four-minute" | "must-score" | "opening-script"
  | "after-turnover" | "sideline" | "clock-stop"
  // coverage beaten
  | "vs-cover-0" | "vs-cover-1" | "vs-cover-2" | "vs-cover-3" | "vs-cover-4"
  | "vs-cover-6" | "vs-man" | "vs-zone" | "blitz-beater";

export interface PlaySpec {
  id: string;
  name: string;
  aliases: string[];
  philosophy: PhilosophyId;
  family: PlayFamily;
  side: "offense" | "defense";
  variantScope: FieldVariantId[];

  formationId: string;
  personnelId?: string;

  /** Run plays name a scheme; the whole line is then derived. */
  run?: { scheme: string; carrier: SlotId; aim: GapId };
  /** Pass plays name a protection; the whole line is then derived. */
  protection?: string;
  /** Free-form grouping for search: "mesh", "four-verts", "smash". */
  concept?: string;

  /** Defensive plays reference these instead of a formation + assignments. */
  frontId?: string;
  coverageId?: string;
  pressureId?: string;

  assignments: Partial<Record<SlotId, Assignment>>;
  reads: Read[];
  primary?: SlotId;
  ballPath?: BallPathSpec;
  zones?: Zone[];
  annotations: Annotation[];

  tags: string[];
  situations: SituationTag[];
  coaching: {
    install?: string;
    keys?: string;
    vsCoverage?: string;
    commentary?: string;
  };
}

// ─── editing ────────────────────────────────────────────────────────────────

export type PathOverride =
  | { mode: "adjust"; pointDeltas: { i: number; dx: Yards; dy: Yards }[] }
  | {
      mode: "freehand";
      points: Vec[];
      curve: CurveMode;
      cap: EndCap;
      style: PathStyle;
    };

/**
 * A drag is an override, not a demolition. Player edits are always stored as
 * deltas from the formation's resolved point, which keeps the formation
 * identity searchable, keeps the edit portable across field variants, and lets
 * a later fix to the formation library still improve every derived play.
 *
 * There is deliberately no moment where a play "becomes geometry". Only a
 * freehand path loses its route identity, and only that one path.
 */
export interface PlayOverrides {
  authoredVariant: FieldVariantId;
  players?: Partial<Record<SlotId, { dx: Yards; dy: Yards }>>;
  paths?: Partial<Record<SlotId, PathOverride>>;
  added?: { id: string; label: string; at: Vec; path?: Vec[] }[];
  removed?: SlotId[];
}

export interface Lineage {
  rootId: string;
  parentId: string;
  rev: number;
  source: "library" | "user";
}

export interface Play {
  spec: PlaySpec;
  overrides?: PlayOverrides;
  lineage?: Lineage;
  /** Coach commentary. Free-text searchable. */
  notes?: string;
}

// ─── playbook ───────────────────────────────────────────────────────────────

/**
 * Glyph language is a per-playbook choice, not global and not per-play. A book
 * whose glyphs change between pages is unreadable, and the book is the thing
 * that gets shared and printed.
 */
export interface BookStyle {
  glyphs: "solid" | "classic" | "letters";
  defenseShape: "diamond" | "square" | "x";
  oLine: "plain" | "numbers" | "technique";
  centerMark: "square" | "circle-underline";
  routeCorners: Corner;
}

export interface BookEntry {
  play: Play;
  position: number;
  section?: string;
  /**
   * What the coach calls on the sheet and what the QB reads on his wrist. Both
   * printed artifacts derive from this one field, so they cannot disagree.
   */
  callNumber?: string;
}

export interface Playbook {
  id: string;
  name: string;
  variant: FieldVariantId;
  style: BookStyle;
  createdAt: string;
  updatedAt: string;
  /** Optional display-name layer over the canonical position labels. */
  roster?: Partial<Record<SlotId, { name: string; number?: string }>>;
  entries: BookEntry[];
}

// ─── resolved output (derived, never stored) ────────────────────────────────

export type GlyphKind = "circle" | "square" | "diamond" | "x" | "double-ring";
export type PlayerRole = "ol" | "qb" | "back" | "receiver" | "defender";

export interface ResolvedPlayer {
  slot: string;
  label: string;
  at: Vec;
  glyph: GlyphKind;
  role: PlayerRole;
  isPrimary: boolean;
}

export interface ResolvedBranch {
  points: Vec[];
  cap: EndCap;
  style: PathStyle;
  label?: string;
}

export interface ResolvedPath {
  slot: string;
  points: Vec[];
  curve: CurveMode;
  style: PathStyle;
  cap: EndCap;
  corner: Corner;
  branches: ResolvedBranch[];
  startDelayMs: number;
  durationMs: number;
  priorityOrder: number;
  routeId?: RouteId;
  /**
   * `coverage` is a journey — a defender travelling to the zone he owns — and
   * animates him. `man` is a relationship, drawn to the receiver he has, and
   * must not move anybody.
   */
  role: "route" | "block" | "carry" | "ball" | "motion" | "coverage" | "man" | "blitz";
  phase: "pre-snap" | "post-snap";
}

export interface ResolvedZone {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  label?: string;
  ownerSlot?: string;
}

export interface ResolvedPlay {
  players: ResolvedPlayer[];
  paths: ResolvedPath[];
  ball: ResolvedPath | null;
  zones: ResolvedZone[];
  annotations: Annotation[];
  /** Slots the variant's body budget dropped, so the UI can say so. */
  omitted: string[];
  warnings: string[];
  durationMs: number;
}

// ─── search ─────────────────────────────────────────────────────────────────

export interface PlayFacets {
  side: "offense" | "defense";
  type: PlayFamily;
  philosophy: PhilosophyId;
  formation: string;
  formationName: string;
  personnel?: string;
  concept?: string;
  variants: FieldVariantId[];
  situations: SituationTag[];
  target: TargetRole[];
  front?: string;
  coverage?: string;
  pressure?: string;
}

export interface PlayIndexEntry {
  id: string;
  name: string;
  playbookId: string | "library";
  f: PlayFacets;
  /** Every facet value AND the prose, lowercased, so one matcher serves both. */
  h: string;
}

export interface Filters {
  side?: "offense" | "defense";
  type?: PlayFamily;
  philosophy?: PhilosophyId;
  formation?: string;
  variant?: FieldVariantId;
  situation?: SituationTag;
  target?: TargetRole;
}

// ─── validation ─────────────────────────────────────────────────────────────

export interface ValidationWarning {
  code:
    | "no-run-zone" | "formation-legality" | "route-depth-clock"
    | "out-of-bounds" | "unknown-reference" | "body-budget";
  message: string;
  slot?: string;
}
