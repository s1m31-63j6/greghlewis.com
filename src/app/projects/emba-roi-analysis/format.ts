// Display formatters shared across the EMBA page. All values are presented
// to readers in rounded-dollar / percent form; raw model decimals stay
// internal.

export function formatDollarsK(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 10_000) {
    return `${sign}$${Math.round(abs / 1_000)}k`;
  }
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatDollarsFull(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(amount)).toLocaleString()}`;
}

export function formatSignedDollarsK(amount: number): string {
  if (amount === 0) return "$0";
  const sign = amount > 0 ? "+" : "−";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatPercent(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}
