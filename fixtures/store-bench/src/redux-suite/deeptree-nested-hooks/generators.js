// The ID and character generators from strings.js and counters.js in
// reduxjs/react-redux-benchmarks, src/scenarios/deeptree-nested-hooks
// (Copyright (c) 2018 Redux, MIT License). getRandomInt draws from a seeded
// generator instead of Math.random(), and both generators restart on every
// mount, so every variant applies the same updates.

import {mulberry32} from '../common/random';

const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let nextCharCounter = 0;
let random = mulberry32(11);

export function resetGenerators() {
  nextCharCounter = 0;
  random = mulberry32(11);
}

export function createStringId(sliceId, depth) {
  const stringId = `${sliceId}-${depth}`;
  return stringId;
}

export function getNextCharacter() {
  const charIndex = nextCharCounter % CHARACTERS.length;
  nextCharCounter++;
  const character = CHARACTERS.charAt(charIndex);
  return character;
}

export function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(random() * (max - min + 1)) + min;
}

// incrementRandomCounter used Math.floor(Math.random() * NUMBER_OF_SLICES).
export function getRandomCounterId(count) {
  return Math.floor(random() * count);
}
