// Seeded data so every variant renders exactly the same entities.

const COLORS = ['red', 'green', 'blue', 'orange', 'purple', 'teal'];
const WORDS = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEntities(n, seed = 42) {
  const random = mulberry32(seed);
  const entities = [];
  for (let i = 0; i < n; i++) {
    entities.push({
      id: 'e' + i,
      label: WORDS[(random() * WORDS.length) | 0] + ' ' + i,
      x: (random() * 1000) | 0,
      y: (random() * 1000) | 0,
      color: COLORS[(random() * COLORS.length) | 0],
    });
  }
  return entities;
}

export function createEntity(i) {
  return {
    id: 'e' + i,
    label: 'added ' + i,
    x: 0,
    y: 0,
    color: 'red',
  };
}

export function matchesFilter(label, filter) {
  return filter === '' || label.includes(filter);
}
