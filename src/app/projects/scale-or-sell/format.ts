// Display formatters shared across the page. Numbers are presented to the
// reader as rounded millions / percents; raw model decimals stay internal.

export function formatDollarsM(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(0)}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}k`;
  }
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatDollarsFull(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(amount)).toLocaleString()}`;
}

export function formatSignedDollarsM(amount: number): string {
  if (Math.abs(amount) < 1) return "$0";
  const sign = amount > 0 ? "+" : "−";
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `${sign}$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatPercent(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatPercentMonthly(p: number, digits = 2): string {
  return `${(p * 100).toFixed(digits)}% / mo`;
}

export function formatMultiple(m: number): string {
  return `${m.toFixed(1)}×`;
}

export function formatMonths(m: number): string {
  if (m === 0) return "today";
  if (m === 1) return "1 mo";
  if (m < 12) return `${m} mo`;
  const years = m / 12;
  if (Number.isInteger(years)) return `${years} yr`;
  return `${years.toFixed(1)} yr`;
}
