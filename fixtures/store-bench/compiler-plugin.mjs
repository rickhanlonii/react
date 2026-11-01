// The React Compiler as an esbuild plugin, shared by build.mjs (the timed
// bundles) and the docs (the "who re-renders" demo), so both compile with the
// same compiler build and options.
//
//   import {compilerPlugin, compileSource} from './compiler-plugin.mjs';
//   await build({..., plugins: [compilerPlugin()]});
//   const code = await compileSource(source, filename);

import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

export const defaultCompilerPath = path.join(
  repo,
  'compiler/packages/babel-plugin-react-compiler/dist/index.js',
);

// Compiles one file with panicThreshold 'all_errors', and throws if the
// compiler reports an error or if a file that defines a component comes out
// without a memo cache. Returns the compiled code (JSX is kept).
export async function compileSource(
  source,
  filename,
  {compilerPath = defaultCompilerPath, requireMemoized = true} = {},
) {
  const babel = require('@babel/core');
  const reactCompiler = require(compilerPath);
  const errors = [];
  const result = await babel.transformAsync(source, {
    filename,
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
            logEvent(file, event) {
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
      `React Compiler failed on ${filename}: ` +
        JSON.stringify(errors[0].detail || errors[0]),
    );
  }
  // Every file that defines a component must come out memoized.
  const definesComponent = /function [A-Z]/.test(source);
  if (requireMemoized && definesComponent && !result.code.includes('_c(')) {
    throw new Error(`React Compiler did not memoize ${filename}`);
  }
  return result.code;
}

// An esbuild plugin that runs compileSource on every file matching `filter`
// (by default, .jsx files under a src/ directory).
export function compilerPlugin({
  filter = /\/src\/.*\.jsx$/,
  compilerPath = defaultCompilerPath,
  requireMemoized = true,
} = {}) {
  return {
    name: 'react-compiler',
    setup(b) {
      b.onLoad({filter}, async args => {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const contents = await compileSource(source, args.path, {
          compilerPath,
          requireMemoized,
        });
        return {contents, loader: 'jsx'};
      });
    },
  };
}
