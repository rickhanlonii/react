'use strict';

const {dev} = require('./dev');
const {build} = require('./build');
const {createDevServer} = require('./dev-server');
const {createWatcher} = require('./watcher');
const {createBuilder} = require('./builder');

module.exports = {dev, build, createDevServer, createWatcher, createBuilder};
