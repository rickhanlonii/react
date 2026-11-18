// Checks the queue preview against real React (G4). It drives the queue demo
// frame with seeded random sequences of dispatches and steps, predicts every
// snapshot with queue-preview.js, and reports the first difference.
//
// The frame is anything with async reset(), dispatch({kind, ops}) and step()
// that resolve to snapshots: the frame itself in Node, or a postMessage proxy
// in the browser.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./queue-preview'));
  } else {
    root.StoreQueueCheck = factory(root.StoreQueuePreview);
  }
})(typeof self !== 'undefined' ? self : this, function (Preview) {
  'use strict';

  const {NoLane, SyncLane, DefaultLane} = Preview;

  // Same reducer as the frame (src/demos/frames/queue.js).
  function reducer(state, action) {
    return action.op === 'add' ? state + action.n : state * action.n;
  }

  // mulberry32: small, fast and deterministic.
  function random(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const opChoices = [
    {op: 'add', n: 1},
    {op: 'add', n: 2},
    {op: 'mul', n: 2},
    {op: 'mul', n: 3},
    // The identity: dropped by the eager bailout when nothing is queued.
    {op: 'add', n: 0},
  ];

  function pickOp(next) {
    const r = next();
    if (r < 0.06) {
      return opChoices[4];
    }
    return opChoices[Math.floor(next() * 4)];
  }

  function generateSequence(seed, length) {
    const next = random(seed);
    const commands = [];
    for (let i = 0; i < length; i++) {
      const r = next();
      if (r < 0.3) {
        commands.push({type: 'step'});
      } else {
        const kind = r < 0.55 ? 'default' : r < 0.85 ? 'transition' : 'sync';
        const ops = [pickOp(next)];
        if (next() < 0.25) {
          ops.push(pickOp(next));
        }
        commands.push({type: 'dispatch', kind, ops});
      }
    }
    // Finish with enough steps to drain the queue.
    commands.push({type: 'step'}, {type: 'step'}, {type: 'step'});
    return commands;
  }

  function describe(command) {
    if (command.type === 'step') {
      return 'step';
    }
    return (
      command.kind +
      '(' +
      command.ops.map(o => (o.op === 'add' ? '+' : '×') + o.n).join(', ') +
      ')'
    );
  }

  // The expected state of the frame, advanced with the preview.
  function createModel(initial, lastTransitionLane) {
    const model = {
      committed: initial,
      record: {baseState: initial, queue: []},
      lastTransitionLane,
      renders: [],
    };
    return model;
  }

  function commitNext(model) {
    const next = Preview.preview(model.record, reducer).next;
    if (next === null) {
      return false;
    }
    // The component renders once per commit, unless its value is the same,
    // in which case it still renders (the store scheduled it) and bails out.
    model.renders.push(next.value);
    model.committed = next.value;
    model.record = next.after;
    return true;
  }

  function applyCommand(model, command, ids) {
    model.renders = [];
    model.lanes = [];
    if (command.type === 'step') {
      if (commitNext(model)) {
        // The commit schedules the root again, and the microtask that
        // processes the schedule resets the event's transition lane, after
        // flushing urgent work if a transition lane was left over (see
        // below).
        if (
          model.eventLane &&
          (Preview.queueLanes(model.record.queue) & Preview.SyncUpdateLanes) !==
            NoLane
        ) {
          commitNext(model);
        }
        model.eventLane = NoLane;
      }
      return;
    }
    // React caches the event's transition lane until the microtask that
    // processes the root schedule, and only an update that's queued
    // schedules that microtask. So a transition whose updates were all
    // dropped by the eager bailout leaves its lane for the next event's
    // transition (useState does the same).
    let eventLane = model.eventLane || NoLane;
    let scheduled = false;
    for (let i = 0; i < command.ops.length; i++) {
      const action = {id: ids[i], op: command.ops[i].op, n: command.ops[i].n};
      if (command.kind === 'transition' && eventLane === NoLane) {
        // dispatchStoreUpdate picks the lane before the eager bailout, so
        // the event claims a transition lane either way.
        eventLane = Preview.nextTransitionLane(model.lastTransitionLane);
        model.lastTransitionLane = eventLane;
      }
      if (
        model.record.queue.length === 0 &&
        Object.is(reducer(model.committed, action), model.committed)
      ) {
        // The eager bailout.
        model.lanes.push(null);
        continue;
      }
      let lane;
      if (command.kind === 'sync') {
        lane = SyncLane;
      } else if (command.kind === 'default') {
        lane = DefaultLane;
      } else {
        lane = eventLane;
      }
      model.lanes.push(lane);
      scheduled = true;
      model.record = {
        baseState: model.record.baseState,
        queue: model.record.queue.concat([{lane, action}]),
      };
    }
    let rendered = false;
    if (
      command.kind === 'sync' &&
      Preview.queueLanes(model.record.queue) & SyncLane
    ) {
      // flushSync renders the urgent batch before it returns.
      rendered = commitNext(model);
    }
    if (scheduled || rendered) {
      // The microtask that processes the root schedule runs after the
      // event. If the event has a transition lane, it flushes default and
      // higher priority work synchronously (processRootScheduleInMicrotask in
      // ReactFiberRootScheduler.js), so urgent updates render right away
      // instead of waiting for a step. That's experimental-channel behavior:
      // it comes with enableDefaultTransitionIndicator (__EXPERIMENTAL__ in
      // OSS), which the vendored build has on. Stable React doesn't do it.
      if (
        eventLane !== NoLane &&
        (Preview.queueLanes(model.record.queue) & Preview.SyncUpdateLanes) !==
          NoLane
      ) {
        commitNext(model);
      }
      model.eventLane = NoLane;
    } else {
      model.eventLane = eventLane;
    }
  }

  function queueKey(queue) {
    return queue
      .map(u => Preview.laneName(u.lane) + ':' + u.action.id)
      .join(' ');
  }

  // The record's queue in dispatch order: the committed base queue, the
  // updates a render has picked up but not processed, then the ones still
  // in React's concurrent queue.
  function actualQueue(snapshot) {
    return snapshot.record.baseQueue
      .concat(snapshot.record.pending)
      .concat(snapshot.inflight);
  }

  function compare(model, snapshot) {
    const problems = [];
    if (snapshot.record === null) {
      problems.push('the store has no record');
      return problems;
    }
    if (!Object.is(snapshot.record.committedValue, model.committed)) {
      problems.push(
        'committed value: expected ' +
          model.committed +
          ', got ' +
          snapshot.record.committedValue
      );
    }
    if (snapshot.screen !== String(model.committed)) {
      problems.push(
        'screen: expected ' + model.committed + ', got ' + snapshot.screen
      );
    }
    if (!Object.is(snapshot.record.baseState, model.record.baseState)) {
      problems.push(
        'base state: expected ' +
          model.record.baseState +
          ', got ' +
          snapshot.record.baseState
      );
    }
    const expectedQueue = queueKey(model.record.queue);
    const gotQueue = queueKey(actualQueue(snapshot));
    if (expectedQueue !== gotQueue) {
      problems.push(
        'queue: expected [' + expectedQueue + '], got [' + gotQueue + ']'
      );
    }
    // The lanes React gave this command's updates, where the frame could
    // see them (a bit the update added to the record's lanes). The event
    // priority mapping isn't assumed: a store.update() in a message event
    // gets its lane from the current Scheduler priority.
    const lastLanes = snapshot.lastLanes || [];
    for (let i = 0; i < (model.lanes || []).length; i++) {
      const want = model.lanes[i];
      const got = lastLanes[i];
      if (want === null || got == null) {
        if ((want === null) !== (got == null)) {
          problems.push(
            'update ' +
              (i + 1) +
              ': expected ' +
              (want === null ? 'the eager bailout' : Preview.laneName(want)) +
              ', got ' +
              (got == null ? 'the eager bailout' : Preview.laneName(got.lane))
          );
        }
      } else if (got.observed && got.lane !== want) {
        problems.push(
          'update ' +
            (i + 1) +
            ' got ' +
            Preview.laneName(got.lane) +
            ', expected ' +
            Preview.laneName(want)
        );
      }
    }
    const latest = Preview.latestValue(model.record, reducer);
    if (!Object.is(snapshot.head, latest)) {
      problems.push(
        'latest value: expected ' + latest + ', got ' + snapshot.head
      );
    }
    if (snapshot.renders.join(',') !== model.renders.join(',')) {
      problems.push(
        'renders: expected [' +
          model.renders.join(',') +
          '], got [' +
          snapshot.renders.join(',') +
          ']'
      );
    }
    return problems;
  }

  async function runSeed(frame, seed, length) {
    const commands = generateSequence(seed, length);
    const initial = 1;
    let snapshot = await frame.reset({initial});
    const model = createModel(initial, snapshot.lastTransitionLane);
    const history = [];
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      history.push(describe(command));
      snapshot =
        command.type === 'step'
          ? await frame.step()
          : await frame.dispatch({kind: command.kind, ops: command.ops});
      // The frame numbers the actions; it reports the ids it used.
      applyCommand(model, command, snapshot.lastIds);
      const problems = compare(model, snapshot);
      if (problems.length > 0) {
        return {
          ok: false,
          seed,
          index: i,
          sequence: history.join(', '),
          problems,
        };
      }
    }
    return {ok: true, seed, commands: commands.length};
  }

  async function runSeeds(
    frame,
    {seeds = 200, firstSeed = 1, length = 24} = {}
  ) {
    let commands = 0;
    for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
      const result = await runSeed(frame, seed, length);
      if (!result.ok) {
        return result;
      }
      commands += result.commands;
    }
    return {ok: true, seeds, commands};
  }

  return {
    reducer,
    random,
    generateSequence,
    describe,
    createModel,
    applyCommand,
    compare,
    runSeed,
    runSeeds,
  };
});
