'use strict';

const path = require('path');
const {createBuilder} = require('./builder');

async function build(options) {
  const rootDir = options.rootDir || path.resolve(__dirname, '../../..');
  const mode = options.production ? 'production' : 'development';

  console.log('Building react-dom-native (' + mode + ')...');

  const builder = createBuilder({rootDir, mode});
  const result = await builder.build();

  if (result.errors.length > 0) {
    console.error('Build failed with errors:');
    for (const err of result.errors) {
      console.error('  ' + err.text);
    }
    process.exit(1);
  }

  console.log('Bundle written to: ' + result.outfile);

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of result.warnings) {
      console.log('  ' + warning.text);
    }
  }
}

module.exports = {build};
