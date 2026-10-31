// Seeded random numbers, so every variant renders the same thing.

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random stream for step i that doesn't depend on which steps ran before.
export function stepRandom(i, salt) {
  return mulberry32(Math.imul(i + 1, 0x9e3779b1) ^ salt);
}
