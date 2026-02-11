#!/usr/bin/env node
'use strict';

const path = require('path');

const command = process.argv[2];
const rootDir = process.cwd();

switch (command) {
  case 'dev': {
    const {dev} = require('../src/dev');
    const port = parseInt(process.argv[3], 10) || 8082;
    dev({rootDir, port});
    break;
  }

  case 'build': {
    const {build} = require('../src/build');
    const production = process.argv.includes('--production');
    build({rootDir, production});
    break;
  }

  default:
    console.log('react-dom-native CLI');
    console.log('');
    console.log('Commands:');
    console.log('  dev              Start dev server with hot reload');
    console.log('  build            Build JS bundle (development)');
    console.log('  build --production  Build JS bundle (production)');
    process.exit(command ? 1 : 0);
}
