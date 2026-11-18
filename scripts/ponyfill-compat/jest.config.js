'use strict';

// The OSS source config (what `yarn test --r=experimental` uses) plus the
// ponyfill adapter. Without PONYFILL_IMPL, the setup files do nothing, so this
// config runs the tests against use(store).

const sourceConfig = require('../jest/config.source');

module.exports = Object.assign({}, sourceConfig, {
  setupFiles: [
    ...sourceConfig.setupFiles,
    require.resolve('./setupPonyfill.js'),
  ],
  setupFilesAfterEnv: [
    ...sourceConfig.setupFilesAfterEnv,
    require.resolve('./setupPonyfillAfterEnv.js'),
  ],
  reporters: [
    'default',
    [
      require.resolve('./reporter.js'),
      {outputFile: process.env.PONYFILL_RESULTS},
    ],
  ],
});
