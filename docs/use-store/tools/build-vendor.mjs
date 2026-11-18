// Bundles the frozen React build into classic scripts the sandboxes can load
// from file:// (Chrome blocks ES module imports there).
//
//   node docs/use-store/tools/build-vendor.mjs
//   node docs/use-store/tools/build-vendor.mjs --react=<dir>   another build
//
// Writes docs/use-store/vendor/:
//   react-dev.js         react, react-dom, scheduler and use-sync-external-store,
//                        development build, registered on window.__modules
//   react-step.js        the same, with scheduler aliased to
//                        scheduler/unstable_mock so a page can step renders
//   react-server-dev.js  react-dom/server (browser), using the React of
//                        whichever of the two bundles above loaded first
//   sucrase.js           sucrase's transform, as window.sucrase
//   VERSIONS.json        the React build (sha, dirty state, hashes) and the
//                        size and hash of every bundle

import {build} from 'esbuild';
import crypto from 'crypto';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..');
const repo = path.resolve(docs, '../..');
const outDir = path.join(docs, 'vendor');

function flag(name) {
  const arg = process.argv.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : null;
}
const reactBuild = path.resolve(
  flag('react') || path.join(repo, 'fixtures/store-bench/react-builds/head'),
);

export const BUDGET = {
  'react-dev.js': 1.2 * 1024 * 1024,
  'react-step.js': 1.2 * 1024 * 1024,
  'sucrase.js': 300 * 1024,
};

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

// The same alias block as fixtures/store-bench/build.mjs, so the sandboxes run
// exactly the build the benchmarks measured.
function aliases(scheduler) {
  return {
    react: path.join(reactBuild, 'react'),
    'react-dom': path.join(reactBuild, 'react-dom'),
    scheduler: scheduler || path.join(reactBuild, 'scheduler'),
    'use-sync-external-store': path.join(reactBuild, 'use-sync-external-store'),
  };
}

function readBuildInfo() {
  const file = path.join(reactBuild, 'BUILD.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `${reactBuild} has no BUILD.json. Use a frozen build (fixtures/store-bench/react-builds/<name>).`,
    );
  }
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dev = fs.readFileSync(
    path.join(reactBuild, 'react/cjs/react.development.js'),
    'utf8',
  );
  if (!dev.includes('unstable_createStore')) {
    throw new Error('The React build does not export unstable_createStore.');
  }
  return info;
}

const common = {
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  // The development build, minified so it fits the budget. Warnings and
  // error messages are strings, so they read the same.
  minify: true,
  legalComments: 'none',
  define: {'process.env.NODE_ENV': '"development"'},
  logLevel: 'warning',
  write: false,
};

function clientEntry(step) {
  return `
var modules = window.__modules || (window.__modules = {});
modules['react'] = require('react');
modules['react-dom'] = require('react-dom');
modules['react-dom/client'] = require('react-dom/client');
modules['react/jsx-runtime'] = require('react/jsx-runtime');
modules['react/jsx-dev-runtime'] = require('react/jsx-dev-runtime');
modules['react/compiler-runtime'] = require('react/compiler-runtime');
modules['scheduler'] = require('scheduler');
${step ? "modules['scheduler/unstable_mock'] = modules['scheduler'];" : ''}
modules['use-sync-external-store/shim'] = require('use-sync-external-store/shim');
modules['use-sync-external-store/shim/with-selector'] = require('use-sync-external-store/shim/with-selector');
window.__REACT_BUILD__ = __REACT_BUILD__;
`;
}

// react-dom/server takes react and react-dom from the client bundle, so a
// component and its store are the same objects on both sides.
const sharedReact = {
  name: 'shared-react',
  setup(b) {
    b.onResolve({filter: /^react(-dom)?$/}, args => ({
      path: args.path,
      namespace: 'shared-react',
    }));
    b.onLoad({filter: /.*/, namespace: 'shared-react'}, args => ({
      contents: `
var m = window.__modules && window.__modules[${JSON.stringify(args.path)}];
if (!m) throw new Error('Load react-dev.js or react-step.js before react-server-dev.js');
module.exports = m;`,
      loader: 'js',
    }));
  },
};

async function bundle(name, options) {
  const result = await build({...common, ...options});
  const code = result.outputFiles[0].contents;
  fs.writeFileSync(path.join(outDir, name), code);
  return {bytes: code.length, sha256: sha256(code)};
}

async function main() {
  const info = readBuildInfo();
  const reactBuildInfo = {
    dir: path.relative(repo, reactBuild),
    version: info.version,
    sha: info.sha,
    branch: info.branch,
    dirty: info.dirty,
    dirtyAffectsBuild: info.dirtyAffectsBuild,
    channel: info.channel,
    builtAt: info.builtAt,
    frozenAt: info.frozenAt,
    hashes: info.hashes,
  };
  const define = {
    ...common.define,
    __REACT_BUILD__: JSON.stringify({
      version: info.version,
      sha: info.sha,
      dirty: info.dirtyAffectsBuild === true,
      channel: info.channel,
    }),
  };
  fs.mkdirSync(outDir, {recursive: true});

  const bundles = {};
  bundles['react-dev.js'] = await bundle('react-dev.js', {
    stdin: {contents: clientEntry(false), resolveDir: here, loader: 'js'},
    alias: aliases(),
    define,
  });
  bundles['react-step.js'] = await bundle('react-step.js', {
    stdin: {contents: clientEntry(true), resolveDir: here, loader: 'js'},
    alias: aliases(path.join(reactBuild, 'scheduler/unstable_mock.js')),
    define,
  });
  bundles['react-server-dev.js'] = await bundle('react-server-dev.js', {
    stdin: {
      contents: `window.__modules['react-dom/server'] = require('react-dom/server.browser');`,
      resolveDir: here,
      loader: 'js',
    },
    alias: aliases(),
    plugins: [sharedReact],
    define,
  });
  bundles['sucrase.js'] = await bundle('sucrase.js', {
    stdin: {
      contents: `window.sucrase = {transform: require('sucrase').transform};`,
      resolveDir: here,
      loader: 'js',
    },
    define: {'process.env.NODE_ENV': '"production"'},
  });

  for (const [name, {bytes}] of Object.entries(bundles)) {
    const budget = BUDGET[name];
    const kb = (bytes / 1024).toFixed(0);
    if (budget !== undefined && bytes > budget) {
      throw new Error(`${name} is ${kb} KB, over its ${budget / 1024} KB budget`);
    }
    console.log(`${name.padEnd(20)} ${kb.padStart(5)} KB`);
  }

  const versions = {
    react: reactBuildInfo,
    tools: {
      esbuild: require('esbuild/package.json').version,
      sucrase: require('sucrase/package.json').version,
    },
    bundles,
  };
  fs.writeFileSync(
    path.join(outDir, 'VERSIONS.json'),
    JSON.stringify(versions, null, 2) + '\n',
  );
  console.log(
    `React ${info.version} (${info.sha.slice(0, 10)}) from ${reactBuildInfo.dir}`,
  );
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
