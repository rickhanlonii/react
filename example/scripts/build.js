'use strict';

const webpack = require('webpack');
const configFactory = require('../webpack.config');

async function build() {
  const mode = process.argv.includes('--production') ? 'production' : 'development';
  const isWatch = process.argv.includes('--watch');
  const config = configFactory({ production: mode === 'production' });
  const compiler = webpack(config);

  if (isWatch) {
    compiler.watch({}, (err, stats) => {
      if (err) console.error(err);
      else if (stats.hasErrors()) console.error(stats.toString({ errors: true }));
      else console.log('Rebuild complete');
    });
    console.log('Watching for changes...');
  } else {
    compiler.run((err, stats) => {
      if (err) { console.error(err); process.exit(1); }
      if (stats.hasErrors()) {
        console.error(stats.toString({ errors: true }));
        process.exit(1);
      }
      console.log(stats.toString({ chunks: true, colors: true }));
    });
  }
}

build();
