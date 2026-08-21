/*
 * A 12-up sheet at true print dimensions, so the printed page can be looked at
 * without a printer. Letter portrait, 0.4in margins -> 7.70 x 10.20in
 * printable; 3 columns x 4 rows with 0.14in gutters gives 2.473 x 2.285in
 * cells. Rendered at 100dpi.
 *
 *   node projects/playbook/results/print-preview.cjs
 */
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { execSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(__dirname, "out");
const cache = new Map();

function resolveSpec(spec, fromDir) {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : path.resolve(fromDir, spec);
  const stripped = base.replace(/\.tsx?$/, "");
  for (const ext of [".tsx", ".ts"]) if (existsSync(stripped + ext)) return stripped + ext;
  throw new Error("cannot resolve " + spec);
}
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const out = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const dir = path.dirname(file);
  new Function("React", "require", "module", "exports", out)(
    React,
    (s) => (s === "react" ? React : s === "react/jsx-runtime" ? require("react/jsx-runtime") : s.endsWith(".css") ? {} : load(resolveSpec(s, dir))),
    mod, mod.exports,
  );
  cache.set(file, mod.exports);
  return mod.exports;
}

const APP = path.join(ROOT, "src/app/projects/playbook");
const LIB = path.join(ROOT, "src/lib/playbook");
const { resolvePlay, DEFAULT_STYLE } = load(path.join(LIB, "resolve.ts"));
const { variant } = load(path.join(LIB, "field.ts"));
const Field = load(path.join(APP, "Field.tsx")).default;
const PlayDiagram = load(path.join(APP, "PlayDiagram.tsx")).default;
const { formationById } = load(path.join(LIB, "formations.ts"));
const PLAYS = JSON.parse(readFileSync(path.join(ROOT, "public/playbook/plays.json"), "utf8"));

// The print palette: the page flips to paper, and defence prints BLACK because
// a mid-red photocopies to the same grey as the offence.
const PRINT = {
  "--turf": "#fff", "--turf-band": "#fff", "--turf-hash": "#e2e6ea",
  "--turf-line-5": "#d5dae0", "--turf-line-10": "#b9c0c8", "--turf-edge": "#8b949e",
  "--turf-number": "#dde2e7", "--turf-nrz": "transparent",
  "--off": "#000", "--def": "#000", "--ball": "#000", "--motion": "#555",
  "--block": "#3a3a3a", "--ghost": "#ccc", "--accent": "#000",
  "--zone-stroke": "#555", "--zone-fill": "transparent", "--ink-quiet": "#555", "--void": "#fff",
};
const inline = (svg) => {
  let out = svg;
  for (const [k, v] of Object.entries(PRINT)) out = out.split(`var(${k})`).join(v);
  const missed = out.match(/var\(--[a-z0-9-]+\)/g);
  if (missed) console.warn("  unresolved:", [...new Set(missed)].join(" "));
  return out;
};

const DPI = 100;
const IN = (n) => n * DPI;
const picks = PLAYS.filter((p) => p.side === "offense").slice(0, 12);

const cellW = 2.473, cellH = 2.285, gut = 0.14, diagW = 2.353, diagH = 1.765, pad = 0.06;
const cells = picks.map((spec, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = IN(col * (cellW + gut)), y = IN(0.42 + 0.08 + row * (cellH + gut));
  const vid = spec.variantScope[0];
  const v = variant(vid);
  const resolved = resolvePlay({ spec }, vid, false, DEFAULT_STYLE);
  const raw = renderToStaticMarkup(
    React.createElement(Field, { variant: v, density: "print12", showRules: false },
      React.createElement(PlayDiagram, { play: resolved, variant: v, style: DEFAULT_STYLE, density: "print12" })),
  );
  const vb = raw.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const body = raw.slice(raw.indexOf(">") + 1, raw.lastIndexOf("</svg>"));
  const s = Math.min(IN(diagW) / vb[2], IN(diagH) / vb[3]);
  const meta = [spec.family, (spec.situations[0] || "").replace(/-/g, " "), spec.primary || (spec.run || {}).carrier]
    .filter(Boolean).join(" · ").toUpperCase();
  return `
  <g transform="translate(${x} ${y})">
    <rect width="${IN(cellW)}" height="${IN(cellH)}" fill="none" stroke="#b9c0c8" stroke-width="0.7"/>
    <text x="${IN(pad)}" y="${IN(pad) + 11}" font-size="11.5" font-weight="700" font-family="Helvetica,Arial">${i + 1} &#183; ${spec.name.replace(/&/g, "&amp;")}</text>
    <text x="${IN(cellW - pad)}" y="${IN(pad) + 11}" font-size="8" fill="#666" text-anchor="end" font-family="Helvetica,Arial">${(formationById(spec.formationId) || {}).name || spec.formationId}</text>
    <g transform="translate(${IN(pad)} ${IN(pad + 0.2)}) scale(${s})">${body}</g>
    <text x="${IN(pad)}" y="${IN(cellH - 0.05)}" font-size="7.5" fill="#666" letter-spacing="0.6" font-family="Helvetica,Arial">${meta}</text>
  </g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IN(7.7)}" height="${IN(10.2)}" viewBox="0 0 ${IN(7.7)} ${IN(10.2)}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="0" y="18" font-size="11" font-weight="700" letter-spacing="1.4" font-family="Helvetica,Arial">VARSITY 2026 &#183; PASS GAME</text>
  <text x="${IN(7.7)}" y="18" font-size="11" fill="#666" text-anchor="end" font-family="Helvetica,Arial">P.1 OF 1 &#183; 08/21/26</text>
  <line x1="0" y1="${IN(0.42)}" x2="${IN(7.7)}" y2="${IN(0.42)}" stroke="#b9c0c8"/>
  ${cells}
</svg>`;

const f = path.join(OUT, "print-12up.svg");
writeFileSync(f, inline(svg));
execSync(`rsvg-convert -w ${IN(7.7)} "${f}" -o "${path.join(OUT, "print-12up.png")}"`);
console.log(`12 cells at ${cellW}x${cellH}in, diagrams ${diagW}x${diagH}in -> results/out/print-12up.png`);
