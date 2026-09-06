/**
 * mulberry32 — the PRNG shared with the Python reference implementation.
 *
 * The parity test drives both engines from the same stream of uniforms, which
 * only works if both sides generate that stream identically. This is the
 * JavaScript half; `projects/career-paths/rng.py` is the other. Change one
 * without the other and `parity_test.py` fails immediately.
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
