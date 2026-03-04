/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {CDPClient} from './cdp-client.js';
import {logger} from './logger.js';
import {McpPage} from './McpPage.js';
import type {Context} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';

export class McpContext implements Context {
  #cdpClient: CDPClient;
  #page: McpPage;
  #isRunningTrace = false;
  #traceResults: TraceResult[] = [];

  constructor(proxyUrl: string) {
    this.#cdpClient = new CDPClient(proxyUrl);
    this.#page = new McpPage(1);
  }

  get cdpClient(): CDPClient {
    return this.#cdpClient;
  }

  getSelectedMcpPage(): McpPage {
    return this.#page;
  }

  setIsRunningPerformanceTrace(x: boolean): void {
    this.#isRunningTrace = x;
  }

  isRunningPerformanceTrace(): boolean {
    return this.#isRunningTrace;
  }

  storeTraceRecording(result: TraceResult): void {
    this.#traceResults = [result];
  }

  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}> {
    const filePath = path.resolve(filename);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, data);
    return {filename: filePath};
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}> {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'falcon-devtools-mcp-'),
    );
    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, data);
    return {filepath};
  }
}
