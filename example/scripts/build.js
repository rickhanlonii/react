'use strict';

const esbuild = require('esbuild');
const path = require('path');

const EXAMPLE_ROOT = path.resolve(__dirname, '..');

// Framework bundle config: builds react-dom-native's entry point
const frameworkConfig = {
  entryPoints: [path.resolve(EXAMPLE_ROOT, '../packages/react-dom-native/src/entry.js')],
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
  outfile: path.resolve(EXAMPLE_ROOT, '../packages/react-dom-native/ios/Sources/ReactDomNativeKit/Resources/bundle.js'),
  logLevel: 'info',
};

async function build() {
  const mode = process.argv.includes('--production') ? 'production' : 'development';
  const isWatch = process.argv.includes('--watch');

  const config = {
    ...frameworkConfig,
    define: {
      __DEV__: mode === 'development' ? 'true' : 'false',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    minify: mode === 'production',
    sourcemap: mode === 'development',
  };

  // Build framework bundle (component modules are built on-the-fly by the server)
  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('Watching for framework bundle changes...');
  } else {
    const result = await esbuild.build(config);
    if (result.errors.length > 0) {
      console.error('Framework bundle build failed');
      process.exit(1);
    }
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
