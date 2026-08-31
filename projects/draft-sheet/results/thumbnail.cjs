/*
 * The landing-page thumbnail: the real board, with real players, real tiers and
 * real ADP spread — composed as SVG and rasterised, rather than mocked up.
 *
 *   node projects/draft-sheet/results/thumbnail.cjs
 *
 * Run this by hand after a change that alters what the card should say — a
 * rename, or a board shift big enough to be worth showing. It is deliberately
 * NOT in the nightly workflow: it shells out to `rsvg-convert`, and it draws in
 * Archivo and JetBrains Mono. A runner has neither the binary nor the fonts, so
 * in CI it would either fail or, worse, quietly rasterise the card in fallback
 * faces and publish that. Keep the renderer where the fonts are.
 */
const { execSync } = require("node:child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(__dirname, "out");
const cache = new Map();
const ts = require("typescript");

function load(file) {
  if (cache.has(file)) return cache.get(file);
  const out = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const dir = path.dirname(file);
  const req = (spec) => load(path.join(dir, spec.replace(/^\.\//, "").replace(/\.ts$/, "") + ".ts"));
  new Function("require", "module", "exports", out)(req, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}

const LIB = path.join(ROOT, "src/lib/draft-sheet");
const { buildBoard } = load(path.join(LIB, "board.ts"));
const { defaultConfig } = load(path.join(LIB, "presets.ts"));

const read = (f) => JSON.parse(readFileSync(path.join(ROOT, "public/draft-sheet", f), "utf8"));
const players = read("players.json").players;
const adp = new Map(read("adp.json").adp.map((a) => [a.id, a]));
const built = buildBoard({ players, config: defaultConfig(), depth: 40 });

const W = 1600, H = 900;
const PAD = 54, HEAD = 158;
const COLS = ["RB", "WR", "TE"];
const COL_W = (W - PAD * 2 - 40) / COLS.length;
const ROW_H = 30;

const POS_COLOR = { QB: "#1b4f7a", RB: "#8c2f39", WR: "#b07d2b", TE: "#2c5d40" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let body = "";
COLS.forEach((pos, ci) => {
  const col = built.columns.find((c) => c.pos === pos);
  if (!col) return;
  const x = PAD + ci * (COL_W + 20);
  const accent = POS_COLOR[pos];

  body += `<rect x="${x}" y="${HEAD}" width="${COL_W}" height="${H - HEAD - PAD}" fill="#ffffff" stroke="#dcdcd7"/>`;
  body += `<rect x="${x}" y="${HEAD}" width="${COL_W}" height="42" fill="#eeeeeb"/>`;
  body += `<rect x="${x}" y="${HEAD + 40}" width="${COL_W}" height="4" fill="${accent}"/>`;
  body += `<text x="${x + 14}" y="${HEAD + 29}" font-family="Archivo,Helvetica,Arial" font-size="21" font-weight="800" letter-spacing="2.2" fill="${accent}">${pos}</text>`;

  let y = HEAD + 58;
  let shown = 0;
  for (const tier of col.tiers) {
    if (shown >= 21) break;
    const take = tier.players.slice(0, Math.min(tier.players.length, 21 - shown));
    if (!take.length) break;
    const tierTop = y - 6;
    const tierH = take.length * ROW_H + 4;

    // The bracket: its LENGTH is the tier's size, which is the decision variable.
    body += `<rect x="${x + 11}" y="${tierTop + 4}" width="3" height="${tierH - 10}" fill="${accent}" opacity="0.55"/>`;
    body += `<text x="${x + 12.5}" y="${tierTop}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="11" fill="#8b9098">${tier.tier}</text>`;

    take.forEach((p, i) => {
      const ry = y + i * ROW_H;
      if ((shown + i) % 2 === 1) {
        body += `<rect x="${x + 24}" y="${ry - 15}" width="${COL_W - 30}" height="${ROW_H}" fill="#f7f7f5"/>`;
      }
      body += `<text x="${x + 32}" y="${ry + 5}" font-family="JetBrains Mono,monospace" font-size="12" fill="#8b9098">${esc(p.posRank[built.board] ?? "")}</text>`;
      body += `<text x="${x + 76}" y="${ry + 5}" font-family="Archivo,Helvetica,Arial" font-size="16" font-weight="600" fill="#16181d">${esc(p.short)}</text>`;
      body += `<text x="${x + COL_W - 96}" y="${ry + 5}" font-family="JetBrains Mono,monospace" font-size="12" fill="#6b7079">${esc(p.team ?? "")}</text>`;

      // The ADP track, drawn the way the real component draws it.
      const a = adp.get(p.id);
      const tx = x + COL_W - 62;
      for (let lane = 0; lane < 4; lane++) {
        const ly = ry - 8 + lane * 4;
        body += `<rect x="${tx}" y="${ly + 1}" width="46" height="1" fill="#dcdcd7"/>`;
        const key = ["yahoo", "espn", "sleeper", "ffc"][lane];
        const rank = a?.rank?.[key];
        if (rank != null && a?.mean != null) {
          const d = Math.max(-1, Math.min(1, (rank - a.mean) / 30));
          body += `<rect x="${(tx + 23 + d * 21).toFixed(1)}" y="${ly}" width="2" height="3" fill="#3b3f47"/>`;
        }
      }
      body += `<rect x="${tx + 23}" y="${ry - 9}" width="1" height="15" fill="#1b4f7a" opacity="0.5"/>`;
    });

    shown += take.length;
    y += take.length * ROW_H + 8;
    body += `<rect x="${x}" y="${y - 10}" width="${COL_W}" height="2" fill="#8b9098"/>`;
  }
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#f7f7f5"/>
<text x="${PAD}" y="66" font-family="Archivo,Helvetica,Arial" font-size="19" font-weight="700" letter-spacing="2.4" fill="#1b4f7a">2026 SEASON</text>
<text x="${PAD}" y="122" font-family="Archivo,Helvetica,Arial" font-size="54" font-weight="800" fill="#16181d">A Draft Board for the Casual Fan</text>
<text x="${W - PAD}" y="122" text-anchor="end" font-family="Archivo,Helvetica,Arial" font-size="15" font-weight="700" letter-spacing="1.6" fill="#6b7079">YAHOO · ESPN · SLEEPER · MOCKS</text>
${body}
</svg>`;

mkdirSync(OUT, { recursive: true });
const svgPath = path.join(OUT, "draft-sheet.svg");
writeFileSync(svgPath, svg);
const png = path.join(ROOT, "public/landing/draft-sheet.png");
execSync(`rsvg-convert -w ${W} -h ${H} -o "${png}" "${svgPath}"`);
console.log(`wrote ${path.relative(ROOT, png)}`);
