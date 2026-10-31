// The update pattern from dispatchers.ts and index.tsx in
// reduxjs/react-redux-benchmarks, src/scenarios/rapid-dispatch (Copyright (c)
// 2018 Redux, MIT License). Every 100ms the original picks one of:
//
// - 40% syncBurst: setStatus, updateValue, setStatus, touch, incrementA, all
//   synchronous (incrementA starts the listener cascade below).
// - 30% thunkBurst: setStatus now, then updateValue and setStatus in a
//   setTimeout(0).
// - 30% listenerCascade: incrementA, whose listeners synchronously dispatch
//   incrementB, incrementC, updateTotal and append.
//
// Each step here is one browser task, timed in flushSync. A thunkBurst is two
// steps: the synchronous part, and the setTimeout part as the next step. The
// item IDs and values come from a seeded generator instead of Math.random().

import {NUM_ITEMS} from './constants';
import {mulberry32, stepRandom} from '../common/random';

function createSchedule(length) {
  const random = mulberry32(7);
  const tasks = [];
  while (tasks.length < length) {
    const roll = random();
    const id = Math.floor(random() * NUM_ITEMS);
    if (roll < 0.4) {
      tasks.push({type: 'syncBurst', id, value: Math.floor(random() * 1000)});
    } else if (roll < 0.7) {
      tasks.push({type: 'thunkStart', id});
      tasks.push({type: 'thunkEnd', id, value: Math.floor(random() * 1000)});
    } else {
      tasks.push({type: 'listenerCascade'});
    }
  }
  return tasks;
}

const schedule = createSchedule(20000);

function runTask(actions, task) {
  switch (task.type) {
    case 'syncBurst':
      actions.syncBurst(task.id, task.value);
      break;
    case 'thunkStart':
      actions.thunkStart(task.id);
      break;
    case 'thunkEnd':
      actions.thunkEnd(task.id, task.value);
      break;
    case 'listenerCascade':
      actions.listenerCascade();
      break;
  }
}

export const scenarios = {
  mixed: {
    batch: 10,
    step(actions, i) {
      runTask(actions, schedule[i % schedule.length]);
    },
  },
  syncBurst: {
    batch: 10,
    step(actions, i) {
      const random = stepRandom(i, 1);
      actions.syncBurst(
        Math.floor(random() * NUM_ITEMS),
        Math.floor(random() * 1000)
      );
    },
  },
  // Pairs of steps: the synchronous part, then the setTimeout part.
  thunkBurst: {
    batch: 10,
    step(actions, i) {
      const random = stepRandom(i >> 1, 2);
      const id = Math.floor(random() * NUM_ITEMS);
      if (i % 2 === 0) {
        actions.thunkStart(id);
      } else {
        actions.thunkEnd(id, Math.floor(random() * 1000));
      }
    },
  },
  listenerCascade: {
    batch: 10,
    step(actions) {
      actions.listenerCascade();
    },
  },
};
