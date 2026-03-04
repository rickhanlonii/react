#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {version} from 'node:process';

const [major, minor] = version.substring(1).split('.').map(Number);

if (
  (major === 20 && minor < 19) ||
  (major === 22 && minor < 12) ||
  major < 20
) {
  console.error(
    `ERROR: falcon-devtools-mcp requires Node 20.19.0+ or 22.12.0+. Current: ${process.version}`,
  );
  process.exit(1);
}

await import('./main.js');
