/* Loads src/lib/start-sit through the TypeScript transpiler for the .cjs scripts. */
const ts = require("typescript");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const LIB = path.resolve(__dirname, "..", "..", "..", "src/lib/start-sit");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const out = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const req = (spec) => load(path.join(path.dirname(file), spec.replace(/\.ts$/, "") + ".ts"));
  new Function("require", "module", "exports", out)(req, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}
const scoring = load(path.join(LIB, "scoring.ts"));
module.exports = {
  components: (p, s = { rec: 0.5, passTd: 4 }) => scoring.components(p, s),
};
