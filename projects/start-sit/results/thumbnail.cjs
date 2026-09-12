/*
 * The landing-page thumbnail: a real comparison on the real page, captured
 * from a running build rather than mocked up.
 *
 *   npx next start -p 3011 &
 *   node projects/start-sit/results/thumbnail.cjs
 *
 * Run by hand after a change that alters what the card should say. Not in the
 * workflow: it needs a browser and the web fonts, and a marketing image must
 * never gate the data commit (see the draft sheet's thumbnail notes).
 *
 * Playwright is resolved from PLAYWRIGHT_MODULE, then the npx cache. The
 * Chromium binary comes from PLAYWRIGHT_CHROMIUM when Playwright's own
 * download is missing.
 */
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const URL = process.env.THUMB_URL ?? "http://localhost:3011/projects/start-sit";
const OUT = path.join(ROOT, "public/landing/start-sit.png");

function playwright() {
  if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
  const cache = execSync("ls -d ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -1", { shell: "/bin/zsh" })
    .toString().trim();
  if (!cache) throw new Error("no playwright found; set PLAYWRIGHT_MODULE");
  return require(cache);
}

(async () => {
  const { chromium } = playwright();
  const launch = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  // Two receivers the page actually prices this week, by expected points.
  const players = JSON.parse(readFileSync(path.join(ROOT, "public/start-sit/players.json"), "utf8")).players;
  const { components } = require("./_lib.cjs");
  const wrs = players.filter((p) => p.pos === "WR" && p.coverage === "full")
    .sort((a, b) => components(b).mean - components(a).mean);
  const ids = [wrs[0].id, wrs[2].id];

  await page.goto(`${URL}?p=${ids.join(",")}&s=0.5-4`, { waitUntil: "networkidle" });
  await page.waitForSelector(".ss-range");
  await page.waitForTimeout(500);
  // The top 1600x900, the size the other landing cards use: masthead, picks,
  // verdict and the range chart.
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1600, height: 900 } });
  await browser.close();
  console.log(`wrote ${path.relative(ROOT, OUT)} (${wrs[0].short} vs ${wrs[2].short})`);
})();
