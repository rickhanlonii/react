// The update pattern from index.tsx in reduxjs/react-redux-benchmarks,
// src/scenarios/deeptree-nested-hooks (Copyright (c) 2018 Redux, MIT License).
// The original clicks five buttons on intervals of 26, 74, 206, 386 and 502ms.
// `mixed` clicks them in the same order those intervals fire, one click per
// step. The other scenarios click one button every step.

const INTERVALS = [
  ['incrementRandom', 26],
  ['appendRandomCharacter', 74],
  ['incrementFifth', 206],
  ['incrementThird', 386],
  ['appendMany', 502],
];

function createSchedule(length) {
  const next = INTERVALS.map(([, period]) => period);
  const clicks = [];
  while (clicks.length < length) {
    // Timers that fire at the same time run in the order they were created.
    let k = 0;
    for (let j = 1; j < next.length; j++) {
      if (next[j] < next[k]) {
        k = j;
      }
    }
    clicks.push(INTERVALS[k][0]);
    next[k] += INTERVALS[k][1];
  }
  return clicks;
}

const schedule = createSchedule(20000);

function click(container, id) {
  container.querySelector('#' + id).click();
}

export const scenarios = {
  mixed: {
    batch: 20,
    step(_actions, i, container) {
      click(container, schedule[i % schedule.length]);
    },
  },
};
for (const [id] of INTERVALS) {
  scenarios[id] = {
    batch: id === 'incrementRandom' || id === 'appendRandomCharacter' ? 50 : 10,
    step(_actions, i, container) {
      click(container, id);
    },
  };
}
