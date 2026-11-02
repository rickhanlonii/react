// The update pattern from index.tsx in reduxjs/react-redux-benchmarks
// (Copyright (c) 2018 Redux, MIT License). The original dispatches a random
// update every 25ms: 60% a post's score, 25% a new comment, 15% a user's role.
// Here every step draws from a generator seeded by the step index, so every
// variant applies exactly the same updates, and the harness times each one in
// flushSync. `score`, `comment` and `role` run one kind of update each.
//
// `batch` is fixed instead of estimated from the warmup: comments accumulate,
// so every variant has to run the same number of steps to end up with the
// same data.

import {NUM_POSTS, NUM_USERS} from './constants';
import {roles} from './data';
import {stepRandom} from '../common/random';

function updateScore(actions, random) {
  const id = Math.floor(random() * NUM_POSTS);
  actions.updateScore(id, Math.floor(random() * 101));
}

function addComment(actions, random) {
  actions.addComment(
    Math.floor(random() * NUM_POSTS),
    Math.floor(random() * NUM_USERS)
  );
}

function updateRole(actions, random) {
  const id = Math.floor(random() * NUM_USERS);
  actions.updateRole(id, roles[Math.floor(random() * roles.length)]);
}

export const scenarios = {
  mixed: {
    batch: 10,
    step(actions, i) {
      const random = stepRandom(i, 1);
      const roll = random();
      if (roll < 0.6) {
        updateScore(actions, random);
      } else if (roll < 0.85) {
        addComment(actions, random);
      } else {
        updateRole(actions, random);
      }
    },
  },
  score: {
    batch: 10,
    step(actions, i) {
      updateScore(actions, stepRandom(i, 2));
    },
  },
  comment: {
    batch: 10,
    step(actions, i) {
      addComment(actions, stepRandom(i, 3));
    },
  },
  role: {
    batch: 50,
    step(actions, i) {
      updateRole(actions, stepRandom(i, 4));
    },
  },
};

// Not part of the port: the same scenarios with K components per category
// instead of 5 (e.g. score-k20), for the derived-selectors-spike suite.
for (const name of ['mixed', 'score', 'comment', 'role']) {
  for (const k of [20, 50]) {
    scenarios[`${name}-k${k}`] = {...scenarios[name], k};
  }
}
