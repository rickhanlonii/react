/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {parseArguments} from './cli.js';
import {logger, saveLogsToFile} from './logger.js';
import {createMcpServer} from './server.js';
import {StdioServerTransport} from './third_party/index.js';
import {VERSION} from './version.js';

const args = parseArguments(VERSION);

if (args.logFile) {
  saveLogsToFile(args.logFile);
}

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting Falcon DevTools MCP Server v${VERSION}`);
const {server} = await createMcpServer({
  proxyUrl: args.proxyUrl,
  logFile: args.logFile,
});
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Falcon DevTools MCP Server connected');
