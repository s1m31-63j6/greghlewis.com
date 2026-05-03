// Manual headshot URL backfill for prospects whose `headshot_candidates`
// in comp_graph.json is empty. The Python pipeline (build_ui_data.py) only
// resolves URLs when the prospect has a PFR↔ESPN crosswalk entry (signed
// NFL players) or a CFBD-prefixed id; that misses ~94% of the 2026 class
// who haven't been ingested into nflverse yet.
//
// Override entries are merged into each node's headshot_candidates at
// fetch time (see CompExplorer's loader). Future Python regenerations of
// the bundle won't disturb this file. When a prospect's `headshot_candidates`
// is later populated by the pipeline, the override still wins (it's
// prepended), which is fine — both URLs probably resolve to similar
// images, and the override is the verified one.
//
// All URLs in this file MUST have been verified to return 200 + image
// content type before being added.

// All URLs verified 2026-05-03 — curl returned 200 + content-type: image/png.
const ESPN_CFB = (id: string) =>
  `https://a.espncdn.com/i/headshots/college-football/players/full/${id}.png`;

export const HEADSHOT_OVERRIDES: Record<string, string[]> = {
  // 2026 prospect class — top headline names
  LoveJe00: [ESPN_CFB("4870808")],            // Jeremiyah Love (RB, Notre Dame)
  LemoMa00: [ESPN_CFB("4870795")],            // Makai Lemon (WR, USC)
  SadiKe00: [ESPN_CFB("5083315")],            // Kenyon Sadiq (TE, Oregon)
  FielMa00: [ESPN_CFB("4682648")],            // Malachi Fields (WR, Notre Dame)
  KoziTa00: [ESPN_CFB("4917427")],            // Tanner Koziol (TE, Houston)
  "draft-2026-pick008": [ESPN_CFB("4880281")], // Jordyn Tyson (WR, Arizona State)
  StowEl00: [ESPN_CFB("4431574")],            // Eli Stowers (TE, Vanderbilt)
  BellCh00: [ESPN_CFB("4869961")],            // Chris Bell (WR, Louisville)
  BostDe00: [ESPN_CFB("4832800")],            // Denzel Boston (WR, Washington)
  BernGe00: [ESPN_CFB("4685261")],            // Germie Bernard (WR, Alabama)
  MendFe00: [ESPN_CFB("4837248")],            // Fernando Mendoza (QB, Indiana)
  "draft-2026-pick024": [ESPN_CFB("4870653")], // KC Concepcion (WR, Texas A&M)
  "draft-2026-pick033": [ESPN_CFB("4710714")], // De'Zhaun Stribling (WR, Ole Miss)
  "draft-2026-pick061": [ESPN_CFB("4833029")], // Max Klare (TE, Ohio State)
  RousSa00: [ESPN_CFB("4685504")],            // Sam Roush (TE, Stanford)
  WillAn04: [ESPN_CFB("5081432")],            // Antonio Williams (WR, Clemson)
  DelpOs01: [ESPN_CFB("4702559")],            // Oscar Delp (TE, Georgia)
  "draft-2026-pick125": [ESPN_CFB("4683153")], // Skyler Bell (WR, UConn)
  JohnEm01: [ESPN_CFB("4832955")],            // Emmett Johnson (RB, Nebraska)
  "draft-2026-pick165": [ESPN_CFB("4685555")], // Nicholas Singleton (RB, Penn State)
  SimpTy00: [ESPN_CFB("4685522")],            // Ty Simpson (QB, Alabama)
  TateCa00: [ESPN_CFB("4871023")],            // Carnell Tate (WR, Ohio State)
  PricJa00: [ESPN_CFB("4685512")],            // Jadarian Price (RB, Notre Dame)
  WashMi00: [ESPN_CFB("4686658")],            // Mike Washington Jr. (RB, Arkansas)
  SarrEl00: [ESPN_CFB("5088338")],            // Elijah Sarratt (WR, Indiana)
};
