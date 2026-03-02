'use strict';

exports.prerender = require('./src/server/NativeFizzStaticNode').prerender;
exports.prerenderToNodeStream = require('./src/server/NativeFizzStaticNode').prerenderToNodeStream;
exports.version = require('./src/shared/version').version;
