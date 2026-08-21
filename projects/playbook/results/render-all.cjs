/*
 * Render EVERY library play through the real card and detail components, at
 * every variant it claims. No browser is connected, so this is what catches a
 * component that throws on some play nobody thought to open.
 *
 *   node projects/playbook/results/render-all.cjs
 */
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const cache = new Map();
const resolveSpec = (spec, from) => {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : path.resolve(from, spec);
  const stripped = base.replace(/\.tsx?$/, "");
  for (const ext of [".tsx", ".ts"]) if (existsSync(stripped + ext)) return stripped + ext;
  throw new Error("cannot resolve " + spec);
};
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
    (s) => (s === "react" ? React : s === "react/jsx-runtime" ? require("react/jsx-runtime")
            : s.startsWith("next/") ? { default: (p) => React.createElement("a", p) }
            : s.endsWith(".css") ? {} : load(resolveSpec(s, dir))),
    mod, mod.exports,
  );
  cache.set(file, mod.exports);
  return mod.exports;
}

const APP = path.join(ROOT, "src/app/projects/playbook");
const LIB = path.join(ROOT, "src/lib/playbook");
const { resolvePlay, DEFAULT_STYLE } = load(path.join(LIB, "resolve.ts"));
const { variant } = load(path.join(LIB, "field.ts"));
const { validate } = load(path.join(LIB, "validate.ts"));
const Field = load(path.join(APP, "Field.tsx")).default;
const PlayDiagram = load(path.join(APP, "PlayDiagram.tsx")).default;
const PlayCard = load(path.join(APP, "PlayCard.tsx")).default;

const PLAYS = JSON.parse(readFileSync(path.join(ROOT, "public/playbook/plays.json"), "utf8"));
const DENSITIES = ["editor", "card", "print12", "wristband"];

let renders = 0, failures = 0;
const warnCodes = new Map();

for (const spec of PLAYS) {
  for (const vid of spec.variantScope) {
    const v = variant(vid);
    let resolved;
    try {
      resolved = resolvePlay({ spec }, vid, false, DEFAULT_STYLE);
    } catch (e) {
      console.error(`  RESOLVE ${spec.id} @ ${vid}: ${e.message}`);
      failures++;
      continue;
    }

    for (const w of validate({ spec }, resolved, vid)) {
      warnCodes.set(w.code, (warnCodes.get(w.code) ?? 0) + 1);
    }

    for (const density of DENSITIES) {
      try {
        const html = renderToStaticMarkup(
          React.createElement(Field, { variant: v, density, showRules: false },
            React.createElement(PlayDiagram, { play: resolved, variant: v, style: DEFAULT_STYLE, density })),
        );
        renders++;
        if (!html.includes("<svg")) throw new Error("no svg emitted");
        // A finite viewBox with no NaN anywhere: one bad divide upstream
        // turns every coordinate into "NaN" and the diagram silently vanishes.
        if (/NaN|Infinity/.test(html)) throw new Error("non-finite coordinate in output");
      } catch (e) {
        console.error(`  RENDER ${spec.id} @ ${vid} (${density}): ${e.message}`);
        failures++;
      }
    }

    try {
      renderToStaticMarkup(
        React.createElement(PlayCard, {
          spec, variant: vid, style: DEFAULT_STYLE, inBook: false,
          onOpen: () => {}, onToggleBook: () => {},
        }),
      );
      renders++;
    } catch (e) {
      console.error(`  CARD ${spec.id} @ ${vid}: ${e.message}`);
      failures++;
    }
  }
}

console.log(`\n${renders} renders across ${PLAYS.length} plays, ${failures} failure(s)`);
if (warnCodes.size) {
  console.log("\nvalidation warnings across the library:");
  for (const [code, n] of [...warnCodes].sort((a, b) => b[1] - a[1])) console.log(`  ${code.padEnd(20)} ${n}`);
}
process.exit(failures ? 1 : 0);
