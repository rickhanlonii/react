/**
 * Post-build script that creates mock files required at runtime by
 * chrome-devtools-frontend. These files are generated during the
 * upstream DevTools build but are not shipped in the npm package.
 *
 * Adapted from chrome-devtools-mcp's scripts/post-build.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const BUILD_DIR = path.join(process.cwd(), 'build');

const devtoolsFrontEndCorePath =
  'node_modules/chrome-devtools-frontend/front_end/core';
const devtoolsThirdPartyPath =
  'node_modules/chrome-devtools-frontend/front_end/third_party';

// Create i18n locales mock
const i18nDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'i18n');
fs.mkdirSync(i18nDir, {recursive: true});
fs.writeFileSync(
  path.join(i18nDir, 'locales.js'),
  `
export const LOCALES = ['en-US'];
export const BUNDLED_LOCALES = ['en-US'];
export const DEFAULT_LOCALE = 'en-US';
export const REMOTE_FETCH_PATTERN = '@HOST@/remote/serve_file/@VERSION@/core/i18n/locales/@LOCALE@.json';
export const LOCAL_FETCH_PATTERN = './locales/@LOCALE@.json';
`,
);

// Create codemirror.next mock
const codeMirrorDir = path.join(
  BUILD_DIR,
  devtoolsThirdPartyPath,
  'codemirror.next',
);
fs.mkdirSync(codeMirrorDir, {recursive: true});
fs.writeFileSync(
  path.join(codeMirrorDir, 'codemirror.next.js'),
  'export default {};\n',
);

// Create root Runtime mock
const rootDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'root');
fs.mkdirSync(rootDir, {recursive: true});
fs.writeFileSync(
  path.join(rootDir, 'Runtime.js'),
  `
export function getChromeVersion() { return ''; }
export const hostConfig = {};
export const Runtime = {
  isDescriptorEnabled: () => true,
  queryParam: () => null,
};
export const experiments = {
  isEnabled: () => false,
};
export const ExperimentName = {
  ALL: '*',
};
`,
);

console.error('post-build: created mock files for chrome-devtools-frontend');
