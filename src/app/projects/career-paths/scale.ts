/** The plinko's x-axis: realized pay on a log scale from $30K to $10M. */

export const X_MIN = 30_000;
export const X_MAX = 10_000_000;
export const N_BINS = 60;
export const TICKS = [30_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

const LOG_SPAN = Math.log(X_MAX / X_MIN);

/** 0..1 position along the axis, clamped at both walls. */
export function unit(v: number): number {
  if (!(v > X_MIN)) return 0;
  if (v >= X_MAX) return 1;
  return Math.log(v / X_MIN) / LOG_SPAN;
}

export function binOf(v: number): number {
  const b = Math.floor(unit(v) * N_BINS);
  return b >= N_BINS ? N_BINS - 1 : b;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
