/*
 * Render the real Advisor and Board to HTML with react-dom/server and assert
 * they are not quietly empty. Same approach as the draft sheet's
 * render-board.cjs: compile the real components, follow the "@/" alias.
 *
 *   node projects/start-sit/results/render.cjs
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
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : path.resolve(fromDir, spec);
  const stripped = base.replace(/\.tsx?$/, "");
  for (const ext of [".tsx", ".ts"]) if (existsSync(stripped + ext)) return stripped + ext;
  throw new Error("cannot resolve " + spec + " from " + fromDir);
}

function load(file) {
  if (cache.has(file)) return cache.get(file);
  const src = readFileSync(file, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const dir = path.dirname(file);
  const req = (spec) => {
    if (spec === "react") return React;
    if (spec === "react/jsx-runtime") return require("react/jsx-runtime");
    if (spec === "react-dom") return require("react-dom");
    if (spec.endsWith(".css")) return {};
    if (spec === "next/link") return { default: ({ children }) => children };
    return load(resolveSpec(spec, dir));
  };
  new Function("React", "require", "module", "exports", out)(React, req, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}

const APP = path.join(ROOT, "src/app/projects/start-sit");
const LIB = path.join(ROOT, "src/lib/start-sit");
const { Advisor } = load(path.join(APP, "Advisor.tsx"));
const { Board } = load(path.join(APP, "Board.tsx"));
const { WaiverList } = load(path.join(APP, "WaiverReport.tsx"));
const { waiverBoard } = load(path.join(LIB, "waivers.ts"));
const { components } = load(path.join(LIB, "scoring.ts"));

const read = (f) => JSON.parse(readFileSync(path.join(ROOT, "public/start-sit", f), "utf8"));
const players = read("players.json").players;
const games = new Map(read("games.json").games.map((g) => [g.id, g]));
const teams = read("teams.json").teams;
const scoring = { rec: 0.5, passTd: 4 };

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
mkdirSync(OUT, { recursive: true });

const wrs = players.filter((p) => p.pos === "WR" && p.coverage === "full")
  .sort((a, b) => components(b, scoring).mean - components(a, scoring).mean);
const none = players.find((p) => p.coverage === "none");
const tdOnly = players.find((p) => p.coverage === "td-only") ?? players.find((p) => p.coverage === "partial");

console.log("\nRendering the advisor");
const CASES = [
  ["pair", [wrs[0], wrs[1]]],
  ["six", [wrs[0], wrs[3], wrs[8], wrs[15], wrs[30], wrs[40]]],
  ["with-no-line", [wrs[0], wrs[1], none]],
  ["partial", [wrs[5], tdOnly]],
  ["one", [wrs[0]]],
];
for (const [name, selected] of CASES) {
  const html = renderToStaticMarkup(React.createElement(Advisor, { selected, scoring, games, teams }));
  writeFileSync(path.join(OUT, `advisor-${name}.html`), html);
  const cards = (html.match(/class="ss-card /g) || []).length;
  const bars = (html.match(/class="ss-bar"/g) || []).length;
  const rows = (html.match(/class="ss-range-row/g) || []).length;
  const verdict = /class="ss-verdict-head"/.test(html);
  const priced = selected.filter((p) => Object.keys(p.stats).length).length;
  check(`${name.padEnd(13)} ${cards} cards · ${bars} bars · ${rows} range rows · verdict ${verdict}`,
    cards === selected.length && bars === priced && verdict && !/NaN|undefined/.test(html)
      && (priced < 2 || rows === priced));
}
{
  const html = readFileSync(path.join(OUT, "advisor-with-no-line.html"), "utf8");
  check("a no-line player is explained, not scored", /no line on him/.test(html) && /left out of the verdict/.test(html));
}

console.log("\nRendering the waiver report");
{
  const held = new Set(players.filter((p) => p.rank <= 120).map((p) => p.id));
  const report = { league: { name: "Test league", teams: 12, rec: 1, passTd: 4 }, rosteredCount: held.size,
    byPos: waiverBoard(players, held, scoring) };
  const html = renderToStaticMarkup(React.createElement(WaiverList, {
    report, scoring, games, teams, picked: new Set(), onCompare: () => {},
  }));
  writeFileSync(path.join(OUT, "waivers.html"), html);
  const rows = (html.match(/class="ss-waiver-row"/g) || []).length;
  const cols = (html.match(/class="ss-waiver-col /g) || []).length;
  check(`waiver report renders ${cols} columns · ${rows} rows`, cols === 4 && rows === 32 && !/NaN|undefined/.test(html)
    && /switch the control above/.test(html));
}

console.log("\nRendering the board");
for (const pos of ["QB", "RB", "WR", "TE"]) {
  // Board has its own position state defaulting to WR; render it as-is and
  // count rows, then confirm each position has enough priced players.
  const n = players.filter((p) => p.pos === pos && Object.keys(p.stats).length).length;
  check(`${pos} has ${n} priced players`, n >= 12);
}
const html = renderToStaticMarkup(React.createElement(Board, {
  players, games, teams, scoring, onAdd: () => {}, picked: new Set(),
}));
writeFileSync(path.join(OUT, "board.html"), html);
const rows = (html.match(/class="ss-row /g) || []).length;
check(`board renders ${rows} WR rows`, rows >= 40 && !/NaN|undefined/.test(html));

console.log(failures === 0 ? `\nrender: all checks passed — HTML in ${path.relative(ROOT, OUT)}\n` : `\nrender: ${failures} FAILURES\n`);
process.exit(failures === 0 ? 0 : 1);
