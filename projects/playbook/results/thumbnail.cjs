/*
 * The landing-page thumbnail: two real diagrams on the product's own surface,
 * rendered from the real components rather than mocked up.
 *
 *   node projects/playbook/results/thumbnail.cjs
 */
const { execSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(__dirname, "out");

execSync(`node ${path.join(__dirname, "render.cjs")} ar-92-mesh flag-mesh`, { cwd: ROOT });

const inner = (file) => {
  const svg = readFileSync(path.join(OUT, file), "utf8");
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  return { vb, body };
};

const a = inner("ar-92-mesh.svg");
const b = inner("flag-mesh.svg");

const W = 1600;
const H = 900;
const PAD = 46;
const GAP = 34;
const HEAD = 128;
const panelW = (W - PAD * 2 - GAP) / 2;
const panelH = H - HEAD - PAD;

const panel = (d, x, label, sub) => {
  const s = Math.min(panelW / d.vb[2], panelH / d.vb[3]);
  const w = d.vb[2] * s;
  const h = d.vb[3] * s;
  return `
  <g transform="translate(${x} ${HEAD})">
    <rect width="${panelW}" height="${panelH}" rx="6" fill="#0a0f0c" stroke="#232b37"/>
    <g transform="translate(${(panelW - w) / 2} ${(panelH - h) / 2}) scale(${s})"
       clip-path="url(#clip)">${d.body}</g>
    <text x="14" y="${panelH - 32}" fill="#f2f5f8" font-size="27" font-weight="800"
          letter-spacing="1.4" font-family="Helvetica,Arial">${label}</text>
    <text x="14" y="${panelH - 11}" fill="#78859a" font-size="17" letter-spacing="2.4"
          font-family="Helvetica,Arial">${sub}</text>
  </g>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><clipPath id="clip"><rect x="0" y="0" width="10000" height="10000"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="#05070a"/>
  <rect x="0" y="${HEAD - 3}" width="${W}" height="3" fill="#ffffff"/>
  <text x="${PAD}" y="60" fill="#22d3ee" font-size="34" font-weight="800"
        font-family="Helvetica,Arial">&#9626;</text>
  <text x="${PAD + 40}" y="60" fill="#f2f5f8" font-size="34" font-weight="800"
        letter-spacing="5" font-family="Helvetica,Arial">PLAYBOOK</text>
  <text x="${PAD}" y="98" fill="#78859a" font-size="20" letter-spacing="3.2"
        font-family="Helvetica,Arial">367 PLAYS &#183; 5, 7 AND 11-MAN &#183; OFFENSE AND DEFENSE</text>
  ${panel(a, PAD, "92 MESH", "AIR RAID &#183; 11-MAN")}
  ${panel(b, PAD + panelW + GAP, "MESH", "FLAG &#183; 5-ON-5")}
</svg>`;

const tmp = path.join(OUT, "thumb.svg");
writeFileSync(tmp, svg);
const dest = path.join(ROOT, "public/landing/playbook.png");
execSync(`rsvg-convert -w ${W} -h ${H} "${tmp}" -o "${dest}"`);
console.log("wrote", path.relative(ROOT, dest));
