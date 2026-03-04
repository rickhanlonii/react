/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ContextPage} from './tools/ToolDefinition.js';

/**
 * Lightweight page shim for single-target CDP connection.
 * There is no real Puppeteer Page — just a placeholder that
 * satisfies the ContextPage interface used by tools.
 */
export class McpPage implements ContextPage {
  readonly id: number;

  constructor(id: number = 1) {
    this.id = id;
  }
}
