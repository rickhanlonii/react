'use strict';

const esbuild = require('esbuild');
const path = require('path');

const EXAMPLE_ROOT = path.resolve(__dirname, '..');

const shared = {
  entryPoints: [path.join(EXAMPLE_ROOT, 'entry/index.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'neutral',
  mainFields: ['module', 'main'],
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  sourcemap: true,
  outfile: path.join(EXAMPLE_ROOT, 'Falcon/Falcon/Resources/bundle.js'),
  logLevel: 'info',
};

async function build() {
  const mode = process.argv.includes('--production') ? 'production' : 'development';
  const isWatch = process.argv.includes('--watch');

  const config = {
    ...shared,
    define: {
      __DEV__: mode === 'development' ? 'true' : 'false',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    minify: mode === 'production',
    sourcemap: mode === 'development',
  };

  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    const result = await esbuild.build(config);
    if (result.errors.length > 0) {
      console.error('Build failed');
      process.exit(1);
    }
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
