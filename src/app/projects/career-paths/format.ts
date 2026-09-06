/** Number formatting for the page. Everything in real 2026 dollars. */

export function fmtDollars(x: number): string {
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a >= 1_000_000_000) return `${sign}$${(a / 1_000_000_000).toFixed(a >= 10_000_000_000 ? 0 : 1)}B`;
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtOneIn(p: number): string {
  if (p <= 0) return "none";
  return `1 in ${Math.round(1 / p).toLocaleString()}`;
}
