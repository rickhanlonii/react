// The update scenarios. Every variant exposes the same actions, so a scenario is
// just a sequence of action calls. The harness times each step inside
// flushSync, so every library renders synchronously and the numbers compare
// the same work.

export const scenarios = {
  // S1: update one entity. Granular stores re-render one row; selector
  // libraries run every row's selector.
  entity: {
    step(actions, i, n) {
      actions.editEntity(i % n);
    },
  },

  // S2: change the selected row. Every row reads the selection. Stores
  // re-render every reader and rely on bailouts; selectors re-render two rows.
  selection: {
    step(actions, i, n) {
      actions.select((i * 7) % n);
    },
  },

  // S3: toggle the filter. Every row derives whether it matches, and the
  // header derives a count.
  filter: {
    step(actions, i) {
      actions.setFilter(i % 2 === 0 ? 'a' : '');
    },
  },

  // S4a: 1% of rows are expanded, and the expanded rows read a frequently
  // updated details value in the row component itself. Stores can read it
  // conditionally; useSelector can't be called conditionally.
  'details-inline': {
    options: {details: 'inline'},
    setup(actions, n) {
      actions.expandEvery(100, n);
    },
    step(actions) {
      actions.tickDetails();
    },
  },

  // S4b: the same, but with the details read in a child component that only
  // mounts when the row is expanded. This is the idiomatic workaround for
  // selector libraries, so both models subscribe only the expanded rows. The
  // other scenarios render rows this way too (see harness.jsx).
  'details-component': {
    options: {details: 'component'},
    setup(actions, n) {
      actions.expandEvery(100, n);
    },
    step(actions) {
      actions.tickDetails();
    },
  },

  // S4c: expand every 10th row, then collapse them again (all but the first).
  // The details are read in a child component, so each step mounts or
  // unmounts N/10 readers: subscribe and unsubscribe churn, plus every row
  // reading the expanded state.
  'details-churn': {
    options: {details: 'component'},
    step(actions, i, n) {
      actions.expandEvery(i % 2 === 0 ? 10 : n, n);
    },
  },

  // S5: add an entity, then remove it.
  structure: {
    step(actions, i) {
      if (i % 2 === 0) {
        actions.add();
      } else {
        actions.removeLast();
      }
    },
  },
};
