/**
 * mulberry32, copied from the two-minute drill, plus the two draws the
 * simulation needs. Seeded so a page reload gives the same band.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal by Box-Muller. */
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma(shape, scale) by Marsaglia and Tsang, with the shape < 1 boost.
 * Used for yardage: a gamma matched to the market's mean and spread is never
 * negative and is right-skewed the way real yardage is, so no floor is needed
 * and the simulated mean equals the expectation it was built from.
 */
export function gamma(rng: Rng, shape: number, scale: number): number {
  if (shape <= 0 || scale <= 0) return 0;
  if (shape < 1) {
    // Gamma(k) = Gamma(k + 1) · U^(1/k)
    return gamma(rng, shape + 1, scale) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

/** Poisson by Knuth's method; the rates here never exceed a handful. */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L);
  return k - 1;
}
