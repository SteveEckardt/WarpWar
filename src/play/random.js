// A seeded random number generator (mulberry32), so a given seed always plays the same game.

export function createRandom(seed) {
  if (!Number.isInteger(seed)) throw new RangeError(`A seed is an integer, not: ${seed}`);
  let a = seed >>> 0;
  // A number in [0, 1).
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // A whole number from 0 to n - 1.
  const int = (n) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (list) => list[int(list.length)],
    // A shuffled copy (Fisher-Yates).
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
