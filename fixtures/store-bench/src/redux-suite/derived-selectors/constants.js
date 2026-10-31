// Ported from reduxjs/react-redux-benchmarks, src/scenarios/derived-selectors
// (constants.ts). Copyright (c) 2018 Redux, MIT License.

export const NUM_USERS = 100;
export const NUM_POSTS = 500;
export const NUM_COMMENTS = 1000;

export const CATEGORIES = [
  'tech',
  'science',
  'sports',
  'politics',
  'entertainment',
  'business',
  'health',
  'education',
];

export const TIER1_COUNT = 50;
export const TIER2_COUNT = 60;
export const TIER3_COUNT = 50;
export let TIER4_COUNT = 40;

// The scenarios ending in -k20 or -k50 (scenarios.js) mount K components per
// category instead of 5. The harness sets this before each mount. The apps
// read TIER4_COUNT during render, so they pick it up without changes.
export const DEFAULT_READERS_PER_CATEGORY = TIER4_COUNT / CATEGORIES.length;
export function setReadersPerCategory(k) {
  TIER4_COUNT = k * CATEGORIES.length;
}

// Stable user IDs: pick TIER3_COUNT evenly spread across NUM_USERS
export const userIds = Array.from({length: TIER3_COUNT}, (_, i) =>
  Math.floor((i * NUM_USERS) / TIER3_COUNT)
);
