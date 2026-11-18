// The update pattern from index.tsx in reduxjs/react-redux-benchmarks,
// src/scenarios/many-components-same-slice (Copyright (c) 2018 Redux, MIT
// License): increment the counter every 13ms. Every component reads it.

export const NUMBER_OF_COMPONENTS = 5000;

export const scenarios = {
  increment: {
    batch: 2,
    step(actions) {
      actions.increment();
    },
  },
};
