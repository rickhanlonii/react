'use strict';

const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const shared = {
  entryPoints: [path.join(ROOT, 'packages/entry/index.js')],
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
  outfile: path.join(ROOT, 'ios/Sources/ReactDomNative/Resources/bundle.js'),
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
