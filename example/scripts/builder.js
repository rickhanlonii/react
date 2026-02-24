'use strict';

const webpack = require('webpack');
const configFactory = require('../webpack.config');

function createBuilder(options) {
  const mode = options.mode || 'development';
  const config = configFactory({ production: mode === 'production' });
  const compiler = webpack(config);

  async function build() {
    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) return reject(err);
        if (stats.hasErrors()) {
          return reject(new Error(stats.toString({ errors: true })));
        }
        resolve({
          errors: stats.compilation.errors,
          warnings: stats.compilation.warnings,
          outfile: config.output.path + '/' + config.output.filename,
        });
      });
    });
  }

  return { build, compiler };
}

module.exports = { createBuilder };
