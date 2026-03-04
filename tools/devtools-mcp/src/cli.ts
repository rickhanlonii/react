/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from './third_party/index.js';
import {yargs, hideBin} from './third_party/index.js';

export const cliOptions = {
  proxyUrl: {
    type: 'string',
    description:
      'URL of the Falcon inspector proxy (default: http://127.0.0.1:6001)',
    default: 'http://127.0.0.1:6001',
    alias: 'p',
  },
  logFile: {
    type: 'string',
    describe: 'Path to a file to write debug logs to.',
  },
} satisfies Record<string, YargsOptions>;

export type ParsedArguments = ReturnType<typeof parseArguments>;

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('falcon-devtools-mcp')
    .options(cliOptions)
    .example([
      ['$0', 'Connect to inspector proxy at default http://127.0.0.1:6001'],
      [
        '$0 --proxy-url http://192.168.1.100:6001',
        'Connect to a remote proxy',
      ],
      ['$0 --log-file /tmp/log.txt', 'Save logs to a file'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
