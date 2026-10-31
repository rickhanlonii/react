// Builds every variant twice, with and without the React Compiler, against the
// local experimental build of React.
//
//   node build.mjs            Timing builds
//   node build.mjs --count    Counting builds (renders and selector calls)
//   node build.mjs --suite=derived-selectors
//                             A scenario ported from reduxjs/react-redux-benchmarks
//                             (see src/redux-suite/suites.mjs)

import {build} from 'esbuild';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import fs from 'fs';
import path from 'path';
import {suites} from './src/redux-suite/suites.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
// --react=<dir> builds against another React build (e.g. a frozen baseline),
// and --out=<dir> writes the bundles somewhere other than dist/.
function flag(name) {
  const arg = process.argv.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : null;
}
const reactBuild = path.resolve(
  here,
  flag('react') || path.join(repo, 'build/oss-experimental'),
);
const compilerPath = path.join(
  repo,
  'compiler/packages/babel-plugin-react-compiler/dist/index.js',
);

const count = process.argv.includes('--count');
const outDir = path.resolve(
  here,
  flag('out') || (count ? 'dist-count' : 'dist'),
);

export const variants = [
  {name: 'store', deps: []},
  {name: 'store-single', deps: []},
  {name: 'context', deps: []},
  {name: 'context-split', deps: []},
  {name: 'redux', deps: ['@reduxjs/toolkit', 'react-redux', 'redux']},
  {name: 'zustand', deps: ['zustand']},
  {name: 'zustand-granular', deps: ['zustand']},
];

const suite = flag('suite');
if (suite !== null && !suites[suite]) {
  throw new Error(`Unknown suite ${suite}`);
}
const appsDir = suite ? suites[suite].apps : 'src/apps';
const suiteVariants = suite ? suites[suite].variants : variants;

function hasDep(name) {
  try {
    require.resolve(name + '/package.json', {paths: [here]});
    return true;
  } catch {
    return false;
  }
}

function checkReactBuild() {
  const reactPackage = path.join(reactBuild, 'react/package.json');
  if (!fs.existsSync(reactPackage)) {
    throw new Error(
      'Missing ' +
        reactBuild +
        '. Build React first: yarn build --r=experimental --type=NODE_PROD',
    );
  }
  const store = fs.readFileSync(
    path.join(reactBuild, 'react/cjs/react.production.js'),
    'utf8',
  );
  if (!store.includes('unstable_createStore')) {
    throw new Error('The React build does not include unstable_createStore.');
  }
}

function compilerPlugin() {
  const babel = require('@babel/core');
  const reactCompiler = require(compilerPath);
  return {
    name: 'react-compiler',
    setup(b) {
      b.onLoad({filter: /\/src\/.*\.jsx$/}, async args => {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const errors = [];
        const result = await babel.transformAsync(source, {
          filename: args.path,
          babelrc: false,
          configFile: false,
          parserOpts: {plugins: ['jsx']},
          plugins: [
            [
              reactCompiler,
              {
                target: '19',
                panicThreshold: 'all_errors',
                logger: {
                  logEvent(filename, event) {
                    if (event.kind === 'CompileError') {
                      errors.push(event);
                    }
                  },
                },
              },
            ],
          ],
        });
        if (errors.length > 0) {
          throw new Error(
            `React Compiler failed on ${args.path}: ` +
              JSON.stringify(errors[0].detail || errors[0]),
          );
        }
        // Every file that defines a component must come out memoized.
        const definesComponent = /function [A-Z]/.test(source);
        if (definesComponent && !result.code.includes('_c(')) {
          throw new Error(`React Compiler did not memoize ${args.path}`);
        }
        return {contents: result.code, loader: 'jsx'};
      });
    },
  };
}

async function buildVariant(variant, compiled) {
  const suffix = (compiled ? 'compiler' : 'nocompiler') + (count ? '-count' : '');
  const outfile = path.join(outDir, `${variant.name}-${suffix}.js`);
  await build({
    // A suite variant can build another entry with extra defines (see
    // src/redux-suite/suites.mjs).
    entryPoints: [path.join(here, appsDir, (variant.entry || variant.name) + '.jsx')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2022',
    outfile,
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
      __COUNT__: count ? 'true' : 'false',
      ...variant.define,
    },
    alias: {
      react: path.join(reactBuild, 'react'),
      'react-dom': path.join(reactBuild, 'react-dom'),
      scheduler: path.join(reactBuild, 'scheduler'),
      'use-sync-external-store': path.join(
        reactBuild,
        'use-sync-external-store',
      ),
    },
    plugins: compiled ? [compilerPlugin()] : [],
    logLevel: 'warning',
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${variant.name} ${suffix}</title></head><body><script src="./${path.basename(outfile)}"></script></body></html>`;
  fs.writeFileSync(outfile.replace(/\.js$/, '.html'), html);
  return path.basename(outfile);
}

async function main() {
  checkReactBuild();
  fs.mkdirSync(outDir, {recursive: true});
  const built = [];
  for (const variant of suiteVariants) {
    const missing = variant.deps.filter(dep => !hasDep(dep));
    if (missing.length > 0) {
      console.log(
        `skip ${variant.name}: missing ${missing.join(', ')} (run yarn in fixtures/store-bench)`,
      );
      continue;
    }
    for (const compiled of [false, true]) {
      built.push(await buildVariant(variant, compiled));
    }
  }
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(built, null, 2),
  );
  console.log(`built ${built.length} bundles into ${path.relative(here, outDir)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
