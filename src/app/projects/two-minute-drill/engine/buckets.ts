/**
 * State bucketing, mirrored verbatim from `projects/two-minute-drill/buckets.py`.
 *
 * The tendency tables are keyed on these bands, so the Python fitter and this
 * engine have to agree on every boundary. If you move one, move it in both
 * places — the parity test is what will catch you if you don't.
 */

export function timeBand(seconds: number): string {
  if (seconds <= 15) return "0-15";
  if (seconds <= 40) return "16-40";
  if (seconds <= 70) return "41-70";
  if (seconds <= 120) return "71-120";
  return "121+";
}

export function diffBand(scoreDiff: number): string {
  if (scoreDiff <= -9) return "down9+";
  if (scoreDiff <= -4) return "down4-8";
  if (scoreDiff <= -1) return "down1-3";
  if (scoreDiff === 0) return "tied";
  if (scoreDiff <= 3) return "up1-3";
  if (scoreDiff <= 8) return "up4-8";
  return "up9+";
}

/**
 * Shared by the tendency tables and the yardage distributions. These were once
 * defined twice with different boundaries, which meant every distribution
 * lookup missed its key and fell through to the pooled distribution — in both
 * implementations identically, so parity passed and nothing looked wrong.
 */
export function ytgBand(ydstogo: number): string {
  if (ydstogo <= 3) return "1-3";
  if (ydstogo <= 6) return "4-6";
  if (ydstogo <= 10) return "7-10";
  if (ydstogo <= 15) return "11-15";
  return "16+";
}

export function yardlineBand(yardline100: number): string {
  if (yardline100 <= 10) return "1-10";
  if (yardline100 <= 25) return "11-25";
  if (yardline100 <= 40) return "26-40";
  if (yardline100 <= 55) return "41-55";
  if (yardline100 <= 70) return "56-70";
  return "71+";
}
