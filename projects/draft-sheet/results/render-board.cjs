/*
 * Render the real Board to HTML so it can actually be looked at without a
 * browser, and assert that it is not quietly empty.
 *
 * Same approach as projects/playbook/results/render.cjs: compile the real
 * components, follow the "@/" alias, render with react-dom/server. A board that
 * builds a correct BuiltBoard but renders zero rows — a bad grid template, a
 * filter that drops everything — would pass the tie-out harness and still be a
 * blank page, so this checks the other half.
 *
 *   node projects/draft-sheet/results/render-board.cjs
 */
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(__dirname, "out");
const cache = new Map();

function resolveSpec(spec, fromDir) {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, "src", spec.slice(2))
    : path.resolve(fromDir, spec);
  const stripped = base.replace(/\.tsx?$/, "");
  for (const ext of [".tsx", ".ts"]) {
    if (existsSync(stripped + ext)) return stripped + ext;
  }
  throw new Error("cannot resolve " + spec + " from " + fromDir);
}

function load(file) {
  if (cache.has(file)) return cache.get(file);
  const src = readFileSync(file, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const dir = path.dirname(file);
  const req = (spec) => {
    if (spec === "react") return React;
    if (spec === "react/jsx-runtime") return require("react/jsx-runtime");
    // The tooltip portals to document.body, so the real react-dom is needed.
    // Under renderToStaticMarkup there is no document, and createPortal is
    // never reached because a tooltip only opens on a pointer event.
    if (spec === "react-dom") return require("react-dom");
    if (spec.endsWith(".css")) return {};
    if (spec === "next/link") return { default: ({ children }) => children };
    return load(resolveSpec(spec, dir));
  };
  new Function("React", "require", "module", "exports", out)(React, req, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}

const APP = path.join(ROOT, "src/app/projects/draft-sheet");
const LIB = path.join(ROOT, "src/lib/draft-sheet");

const { buildBoard } = load(path.join(LIB, "board.ts"));
const { defaultConfig, SCORING_PRESETS, LEAGUE_TOGGLES } = load(path.join(LIB, "presets.ts"));
const { PLATFORMS } = load(path.join(LIB, "types.ts"));
const { Board } = load(path.join(APP, "Board.tsx"));
const ALL_PLATFORMS = PLATFORMS.map((p) => p.key);

const read = (f) => JSON.parse(readFileSync(path.join(ROOT, "public/draft-sheet", f), "utf8"));
const players = read("players.json").players;
const adpList = read("adp.json").adp;
const adp = new Map(adpList.map((a) => [a.id, a]));
const teams = read("teams.json").teams;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

mkdirSync(OUT, { recursive: true });

const CASES = [
  ["default", defaultConfig()],
  ...SCORING_PRESETS.map((p) => [
    p.id,
    { ...defaultConfig(), scoring: { ...defaultConfig().scoring, rec: p.rec } },
  ]),
  ...LEAGUE_TOGGLES.map((t) => [t.id, t.toggle(defaultConfig())]),
  ["keepers", { ...defaultConfig() }],
];

console.log("\nRendering the board");
for (const [name, config] of CASES) {
  const prefs =
    name === "keepers"
      ? { removed: players.slice(0, 20).map((p) => p.id), starred: [players[40].id], notes: {} }
      : { removed: [], starred: [], notes: {} };

  const built = buildBoard({ players, config, prefs, depth: 60 });
  const html = renderToStaticMarkup(
    React.createElement(Board, {
      built, adp, teams, prefs, platforms: ALL_PLATFORMS,
      onStar: () => {}, onRemove: () => {}, onOpen: () => {}, showRemoved: false,
    }),
  );

  const rows = (html.match(/class="ds-row/g) || []).length;
  const tiers = (html.match(/class="ds-tier[ "]/g) || []).length;
  const logos = (html.match(/a\.espncdn\.com/g) || []).length;
  const cells = (html.match(/class="ds-cell/g) || []).length;
  const trends = (html.match(/class="ds-trend/g) || []).length;
  const keys = (html.match(/class="ds-colkey"/g) || []).length;
  const cols = built.columns.length;

  writeFileSync(path.join(OUT, `board-${name}.html`), html);
  check(
    `${name.padEnd(12)} ${cols} columns · ${rows} rows · ${tiers} tiers · ` +
      `${logos} team marks · ${cells} platform cells · ${trends} trend arrows · ${keys} column keys`,
    rows > 150 && cols >= 4 && tiers > 10 && logos > 100
      // Four platforms per row, a trend arrow on every row, one key per column.
      && cells >= rows * 4 && trends === rows && keys === cols,
  );
}

// A keeper league must actually drop the keepers AND move replacement level.
{
  const cfg = defaultConfig();
  const plain = buildBoard({ players, config: cfg, prefs: { removed: [], starred: [], notes: {} }, depth: 60 });
  const removed = players.slice(0, 20).map((p) => p.id);
  const kept = buildBoard({ players, config: cfg, prefs: { removed, starred: [], notes: {} }, depth: 60 });
  const stillThere = kept.overall.filter((p) => removed.includes(p.id)).length;
  check("removed players leave the board entirely", stillThere === 0, `${stillThere} survived`);
  check(
    "removing 20 players changes who is on screen",
    JSON.stringify(plain.overall.slice(0, 30).map((p) => p.id)) !==
      JSON.stringify(kept.overall.slice(0, 30).map((p) => p.id)),
  );
}

console.log(
  failures === 0
    ? `\nrender: all checks passed — HTML in ${path.relative(ROOT, OUT)}\n`
    : `\nrender: ${failures} FAILURES\n`,
);
process.exit(failures === 0 ? 0 : 1);
