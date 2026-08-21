/*
 * Render real components to SVG so the diagrams can actually be looked at.
 *
 * No browser is connected, so this is the substitute: compile the real Field
 * and PlayDiagram, resolve the CSS custom properties they draw through, and
 * write an SVG that the next step rasterises. Same approach as
 * two-minute-drill/results/render-chart.cjs, generalised to follow the "@/"
 * alias and both .ts and .tsx.
 *
 *   node projects/playbook/results/render.cjs [playId ...]
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
    if (spec.endsWith(".css")) return {};
    return load(resolveSpec(spec, dir));
  };
  new Function("React", "require", "module", "exports", out)(React, req, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}

const APP = path.join(ROOT, "src/app/projects/playbook");
const LIB = path.join(ROOT, "src/lib/playbook");

const { resolvePlay, DEFAULT_STYLE } = load(path.join(LIB, "resolve.ts"));
const { variant } = load(path.join(LIB, "field.ts"));
const Field = load(path.join(APP, "Field.tsx")).default;
const PlayDiagram = load(path.join(APP, "PlayDiagram.tsx")).default;

const PLAYS = JSON.parse(readFileSync(path.join(ROOT, "public/playbook/plays.json"), "utf8"));

// The values from styles.css, so the SVG is standalone and looks like the app.
const TOKENS = {
  "--turf": "#0a0f0c", "--turf-band": "#0d130f", "--turf-hash": "#2c3a33",
  "--turf-line-5": "#3a4c42", "--turf-line-10": "#4e655a", "--turf-edge": "#5e7a6e",
  "--turf-number": "#33453c", "--turf-nrz": "rgba(245,165,36,0.07)",
  "--off": "#ffffff", "--def": "#ff4757", "--ball": "#f5a524", "--motion": "#a78bfa",
  "--block": "#c2cbd6", "--ghost": "rgba(255,255,255,0.22)",
  "--zone-stroke": "rgba(255,71,87,0.62)", "--zone-fill": "rgba(255,71,87,0.11)",
  "--accent": "#22d3ee", "--ink-quiet": "#8b97a6", "--void": "#05070a",
};

function inline(svg) {
  let out = svg;
  for (const [k, v] of Object.entries(TOKENS)) {
    out = out.split(`var(${k})`).join(v);
  }
  // Any token we forgot becomes obvious rather than silently transparent.
  const missed = out.match(/var\(--[a-z0-9-]+\)/g);
  if (missed) console.warn("  unresolved tokens:", [...new Set(missed)].join(" "));
  return out.replace(
    "<svg",
    '<svg xmlns="http://www.w3.org/2000/svg" style="font-family:Helvetica,Arial,sans-serif"',
  );
}

const ids = process.argv.slice(2);
const chosen = ids.length
  ? PLAYS.filter((p) => ids.includes(p.id))
  : ["ar-92-mesh", "gap-power-right", "rpo-iz-bubble", "flag-mesh", "d-over-cover-3", "fb-inside-veer"]
      .map((id) => PLAYS.find((p) => p.id === id))
      .filter(Boolean);

mkdirSync(OUT, { recursive: true });

for (const spec of chosen) {
  const vid = spec.variantScope[0];
  const v = variant(vid);
  const resolved = resolvePlay({ spec }, vid, false, DEFAULT_STYLE);
  const svg = renderToStaticMarkup(
    React.createElement(
      Field,
      { variant: v, density: "editor", ariaLabel: spec.name },
      React.createElement(PlayDiagram, {
        play: resolved,
        variant: v,
        style: DEFAULT_STYLE,
        density: "editor",
      }),
    ),
  );
  const file = path.join(OUT, `${spec.id}.svg`);
  writeFileSync(file, inline(svg));
  console.log(
    `${spec.id.padEnd(22)} ${vid.padEnd(7)} ${resolved.players.length} players, ` +
      `${resolved.paths.length} paths${resolved.ball ? " + ball" : ""}` +
      `${resolved.omitted.length ? `, omitted ${resolved.omitted.join("/")}` : ""}`,
  );
}
console.log(`\nwrote ${chosen.length} svg to ${path.relative(ROOT, OUT)}`);
