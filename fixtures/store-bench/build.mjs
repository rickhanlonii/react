// Builds every variant twice, with and without the React Compiler, against the
// local experimental build of React.
//
//   node build.mjs            Timing builds
//   node build.mjs --count    Counting builds (renders and selector calls)
//   node build.mjs --suite=derived-selectors
//                             A scenario ported from reduxjs/react-redux-benchmarks
//                             (see src/redux-suite/suites.mjs)

import {build} from 'esbuild';
import crypto from 'crypto';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import fs from 'fs';
import path from 'path';
import {suites} from './src/redux-suite/suites.mjs';
import {compilerPlugin} from './compiler-plugin.mjs';

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
// --compiler=<file> uses another build of babel-plugin-react-compiler (e.g. a
// copy of dist/index.js, so a yarn build in the repo can't change it).
const compilerPath = flag('compiler')
  ? path.resolve(here, flag('compiler'))
  : path.join(repo, 'compiler/packages/babel-plugin-react-compiler/dist/index.js');

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
    plugins: compiled ? [compilerPlugin({compilerPath})] : [],
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
    // A suite variant can skip the build without the compiler (see the
    // sweeps in src/redux-suite/suites.mjs).
    for (const compiled of variant.compiled || [false, true]) {
      built.push(await buildVariant(variant, compiled));
    }
  }
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(built, null, 2),
  );
  // Provenance for run.mjs: which React build and compiler these bundles use.
  // Frozen builds carry a BUILD.json (sha, dirty state, file hashes).
  const buildJson = path.join(reactBuild, 'BUILD.json');
  const compilerSource = fs.readFileSync(compilerPath);
  fs.writeFileSync(
    path.join(outDir, 'build-info.json'),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        suite,
        count,
        react: {
          dir: path.relative(here, reactBuild),
          version: require(path.join(reactBuild, 'react/package.json')).version,
          ...(fs.existsSync(buildJson)
            ? JSON.parse(fs.readFileSync(buildJson, 'utf8'))
            : {sha: null, note: 'unfrozen build: no BUILD.json'}),
        },
        compiler: {
          path: path.relative(here, compilerPath),
          bytes: compilerSource.length,
          sha256: crypto
            .createHash('sha256')
            .update(compilerSource)
            .digest('hex')
            .slice(0, 16),
        },
      },
      null,
      2,
    ),
  );
  console.log(`built ${built.length} bundles into ${path.relative(here, outDir)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
