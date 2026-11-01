'use strict';

// Records which tests touched our store internals through the adapter's
// facade (see adapter.js), so report.js can classify them as N/A even if the
// thrown error was swallowed.

const fs = require('fs');

const log = process.env.PONYFILL_NA_LOG;

beforeEach(() => {
  global.__ponyfillNotApplicable = [];
});

afterEach(() => {
  const reasons = global.__ponyfillNotApplicable;
  if (log && reasons && reasons.length > 0) {
    const state = expect.getState();
    fs.appendFileSync(
      log,
      JSON.stringify({
        testPath: state.testPath,
        name: state.currentTestName,
        reasons: Array.from(new Set(reasons)),
      }) + '\n'
    );
  }
});
