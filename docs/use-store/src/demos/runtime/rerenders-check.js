// The "who re-renders" demo's script and expected renders (G4). For each
// command and panel: which components' bodies run, and the frame's flashes
// must show exactly those renders.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StoreRerendersCheck = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROWS = 6;

  const panels = [
    {
      panel: 'selectors',
      script: 'rerenders-selectors',
      title: 'Selectors',
      compiled: true,
    },
    {
      panel: 'stores',
      script: 'rerenders-stores-nocompiler',
      title: 'use(store), no compiler',
      compiled: false,
    },
    {
      panel: 'stores-compiled',
      script: 'rerenders-stores-compiler',
      title: 'use(store) + React Compiler',
      compiled: true,
    },
  ];

  const script = [
    {type: 'select', id: 'r3'},
    {type: 'select', id: 'r4'},
    {type: 'edit', id: 'r2'},
    {type: 'select', id: 'r2'},
    {type: 'edit', id: 'r2'},
  ];

  // The renders each panel should do for a command, given the selected row
  // before it.
  function expectedRenders(panel, command, selectedBefore) {
    if (command.type === 'edit') {
      return {Row: 1, RowView: 1};
    }
    let changed = 0;
    if (selectedBefore !== command.id) {
      changed = selectedBefore === null ? 1 : 2;
    }
    if (panel === 'selectors') {
      return changed === 0 ? {} : {Row: changed, RowView: changed};
    }
    if (panel === 'stores') {
      return {Row: ROWS, RowView: ROWS};
    }
    return changed === 0 ? {Row: ROWS} : {Row: ROWS, RowView: changed};
  }

  function sameCounts(a, b) {
    const names = new Set(Object.keys(a).concat(Object.keys(b)));
    let same = true;
    names.forEach(name => {
      if ((a[name] || 0) !== (b[name] || 0)) {
        same = false;
      }
    });
    return same;
  }

  function format(counts) {
    const names = Object.keys(counts)
      .filter(n => counts[n] > 0)
      .sort();
    return names.length === 0
      ? 'nothing'
      : names.map(n => n + ' ' + counts[n]).join(', ');
  }

  function checkSnapshot(panel, command, selectedBefore, snapshot) {
    const problems = [];
    const expected = expectedRenders(panel, command, selectedBefore);
    if (!sameCounts(expected, snapshot.renders)) {
      problems.push(
        panel +
          ' after ' +
          command.type +
          ' ' +
          command.id +
          ': expected renders ' +
          format(expected) +
          ', got ' +
          format(snapshot.renders)
      );
    }
    if (snapshot.flashes == null) {
      problems.push(panel + ': the frame hook reported no renders');
    } else if (!sameCounts(snapshot.flashes, snapshot.renders)) {
      problems.push(
        panel +
          ': flashes (' +
          format(snapshot.flashes) +
          ') differ from body counters (' +
          format(snapshot.renders) +
          ')'
      );
    }
    return problems;
  }

  // frames: {[panel]: {reset(), run(command)}}
  async function runScript(frames) {
    const problems = [];
    for (const {panel} of panels) {
      await frames[panel].reset();
      let selected = null;
      for (const command of script) {
        const snapshot = await frames[panel].run(command);
        problems.push(...checkSnapshot(panel, command, selected, snapshot));
        if (command.type === 'select') {
          selected = command.id;
        }
      }
    }
    return problems;
  }

  return {
    panels,
    script,
    expectedRenders,
    checkSnapshot,
    runScript,
    format,
    ROWS,
  };
});
