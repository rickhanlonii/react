// The cost of a shared-cache lookup, to estimate when sharing a call pays
// off: on a per-instance miss, a shared cache adds a lookup (and on a shared
// miss, an insert) to every call it wraps, shared or not.
//
//   node spike-shared-derived/lookup-cost.mjs
//
// Part of the shared-derived-data spike
// (docs/use-store/research/shared-derived-data.md).

import {weakMapMemoize} from 'reselect';
import {
  weakMemo,
  sharedCall,
  generationalMemo,
  nextGeneration,
} from '../src/redux-suite/derived-selectors/shared-memo.js';

const N = 200;
// A cheap derivation, like PostCard reading one entity.
const pick = (list, id) => list[id].score;
const list = Array.from({length: N}, (_, i) => ({id: i, score: i}));

function time(name, setup) {
  // Each round is one "update": a new snapshot, then N calls with N different
  // ids (a miss each, as when nothing is shared), then the same N calls again
  // (a hit each, as for the other readers that share them).
  const {call, onUpdate} = setup();
  const rounds = 2000;
  let snapshot = list;
  let sink = 0;
  let missNs = 0;
  let hitNs = 0;
  for (let r = 0; r < rounds + 200; r++) {
    snapshot = snapshot.slice();
    onUpdate?.();
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      sink += call(snapshot, i);
    }
    let t1 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      sink += call(snapshot, i);
    }
    const t2 = process.hrtime.bigint();
    if (r >= 200) {
      missNs += Number(t1 - t0);
      hitNs += Number(t2 - t1);
    }
  }
  const calls = rounds * N;
  console.log(
    name.padEnd(36),
    `${(missNs / calls).toFixed(0)} ns`.padStart(8),
    `${(hitNs / calls).toFixed(0)} ns`.padStart(8),
    sink > 0 ? '' : '',
  );
}

console.log('per call'.padEnd(36), 'miss'.padStart(8), 'hit'.padStart(8));
time('direct call (no cache)', () => ({call: pick}));
time('weakMemo', () => {
  const memo = weakMemo(pick);
  return {call: memo};
});
time('sharedCall', () => ({call: (l, i) => sharedCall(pick, l, i)}));
time('reselect weakMapMemoize', () => {
  const memo = weakMapMemoize(pick);
  return {call: memo};
});
time('generationalMemo', () => {
  const memo = generationalMemo(pick);
  return {call: memo, onUpdate: nextGeneration};
});
