// Prints the React Compiler's output for a file, with the options build.mjs
// uses. Used to generate apps/store-compiled.jsx for the shared-derived-data
// spike (docs/use-store/research/shared-derived-data.md).
//
//   node spike-shared-derived/compile.mjs src/redux-suite/derived-selectors/apps/store.jsx

import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const babel = require('@babel/core');
const reactCompiler = require(
  path.join(repo, 'compiler/packages/babel-plugin-react-compiler/dist/index.js'),
);

const file = path.resolve(process.argv[2]);
const result = babel.transformSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  babelrc: false,
  configFile: false,
  parserOpts: {plugins: ['jsx']},
  plugins: [[reactCompiler, {target: '19', panicThreshold: 'all_errors'}]],
});
process.stdout.write(result.code + '\n');
