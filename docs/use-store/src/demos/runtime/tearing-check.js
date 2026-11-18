// The tearing demo's script and its expected outcomes (G4). The same script
// is the demo's "Play" button, so what the gate checks is what readers see.
//
// The script: start a transition that re-renders every cell, render two
// cells, change the source from outside React, then let React finish.
//
// Expected:
// - global: the transition commits cells that read different values (it
//   tears);
// - uses: the change forces a sync render of every cell before the next step
//   (useSyncExternalStore de-opts to sync), and every commit is consistent;
// - store, changed in a message event: the update gets the default lane,
//   nothing renders when it's dispatched, the transition keeps rendering and
//   commits the value it started with, then the update commits;
// - store-click, changed in a click: the update gets the sync lane, renders
//   every cell synchronously, and the transition restarts on top of it.
// Neither commit tears. The order is observed (observe()) and asserted.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StoreTearingCheck = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // From ReactFiberLane.js.
  const SyncLane = 0b10;
  const DefaultLane = 0b100000;

  const script = [
    {command: 'start', label: 'Start a transition'},
    {command: 'step', label: 'Render cell 1'},
    {command: 'step', label: 'Render cell 2'},
    {command: 'mutate', label: 'Change the source'},
    {command: 'step', label: 'Step'},
    {command: 'step', label: 'Step'},
    {command: 'step', label: 'Step'},
    {command: 'step', label: 'Step'},
  ];

  function allEqual(values) {
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[0]) {
        return false;
      }
    }
    return true;
  }

  // Runs the script on one frame and returns every snapshot.
  async function runScript(frame) {
    const snapshots = [await frame.reset()];
    for (let i = 0; i < script.length; i++) {
      snapshots.push(await frame[script[i].command]());
    }
    // Then everything that's left.
    snapshots.push(await frame.finish());
    return snapshots;
  }

  function entriesOf(snapshots) {
    const entries = [];
    for (let i = 1; i < snapshots.length; i++) {
      for (let j = 0; j < snapshots[i].log.length; j++) {
        entries.push(snapshots[i].log[j]);
      }
    }
    return entries;
  }

  // What happened to the transition when the store changed in the middle of
  // its render, as observed (not assumed):
  // - 'transition-first': the transition kept rendering and committed the
  //   value it started with, then the update committed;
  // - 'update-first': the update committed first and the transition
  //   restarted on top of it;
  // - null: no commit with the new value after the change.
  function observeStoreOrder(entries) {
    const mutateIndex = entries.findIndex(e => e.command === 'mutate');
    const after = entries.filter(
      (e, i) => i > mutateIndex && e.type === 'commit'
    );
    if (after.length === 0 || after[after.length - 1].values[0] !== 1) {
      return null;
    }
    return after[0].round === 1 && after[0].values[0] === 0
      ? 'transition-first'
      : 'update-first';
  }

  // The facts the explainer shows, per source.
  function observe(snapshots) {
    const entries = entriesOf(snapshots);
    const commits = entries.filter(e => e.type === 'commit');
    return {
      tore: commits.some(c => !allEqual(c.values)),
      renderedOnChange: entries.filter(
        e => e.type === 'render' && e.command === 'mutate'
      ).length,
      storeOrder: observeStoreOrder(entries),
    };
  }

  // Returns a list of problems, empty if the outcome is the expected one.
  function checkOutcome(source, snapshots, cells) {
    const problems = [];
    const entries = entriesOf(snapshots);
    const commits = entries.filter(e => e.type === 'commit');
    const mutateRenders = entries.filter(
      e => e.type === 'render' && e.command === 'mutate'
    );
    const mutateIndex = entries.findIndex(e => e.command === 'mutate');
    const final = snapshots[snapshots.length - 1];
    if (source === 'global') {
      const torn = commits.filter(c => !allEqual(c.values));
      if (torn.length === 0) {
        problems.push(
          'the global should tear, but every commit was consistent'
        );
      }
      if (mutateRenders.length > 0) {
        problems.push('changing the global should not render anything');
      }
      return problems;
    }
    if (!allEqual(final.screen) || final.screen[0] !== 1) {
      problems.push(
        'the final screen should show 1 in every cell, got ' +
          final.screen.join(',')
      );
    }
    const torn = commits.filter(c => !allEqual(c.values));
    if (torn.length > 0) {
      problems.push(
        source + ' tore: a commit showed ' + torn[0].values.join(',')
      );
    }
    // useSyncExternalStore, and a store updated in a click, both render
    // every cell synchronously when the source changes.
    if (source === 'uses' || source === 'store-click') {
      const cellsRendered = new Set(mutateRenders.map(e => e.cell));
      if (cellsRendered.size !== cells) {
        problems.push(
          'the change should render every cell synchronously, before the next step; rendered ' +
            cellsRendered.size
        );
      }
      if (!mutateRenders.every(e => e.value === 1)) {
        problems.push('the sync render should read the new value');
      }
    }
    if (source === 'uses') {
      return problems;
    }
    // The lane store.update() got, as the frame saw it on the record. It
    // comes from the event: a message event maps through the current
    // Scheduler priority (normal, so the default lane), a click is discrete
    // (the sync lane).
    const mutateSnapshot =
      snapshots[1 + script.findIndex(s => s.command === 'mutate')];
    const wantLane = source === 'store' ? DefaultLane : SyncLane;
    if (mutateSnapshot.changeLane !== wantLane) {
      problems.push(
        'store.update() should get lane ' +
          wantLane +
          ', got ' +
          mutateSnapshot.changeLane
      );
    }
    if (source === 'store' && mutateRenders.length > 0) {
      problems.push(
        'a default-lane store update should not render anything before the next step'
      );
    }
    const order = observeStoreOrder(entries);
    // getNextLanes (ReactFiberLane.js) keeps rendering the in-progress
    // lanes when the new lane is DefaultLane and the render is a
    // transition: "Default priority updates should not interrupt transition
    // updates." A sync lane is higher priority and interrupts, so the
    // transition restarts on top of the update. If React's lane policy
    // changes, this fails instead of the explainer saying the wrong thing.
    const wantOrder = source === 'store' ? 'transition-first' : 'update-first';
    if (order === null) {
      problems.push(
        'expected a commit with the update after the store changed, got ' +
          commits.filter(c => entries.indexOf(c) > mutateIndex).length +
          ' commits'
      );
    } else if (order !== wantOrder) {
      problems.push('expected ' + wantOrder + ', observed ' + order);
    }
    return problems;
  }

  return {script, runScript, checkOutcome, observe, allEqual};
});
