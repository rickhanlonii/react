/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TextContent} from './third_party/index.js';
import type {Response} from './tools/ToolDefinition.js';
import type {InsightName, TraceResult} from './trace-processing/parse.js';
import {getInsightOutput, getTraceSummary} from './trace-processing/parse.js';

export class McpResponse implements Response {
  #lines: string[] = [];
  #traceSummary: TraceResult | null = null;
  #traceInsight: {
    trace: TraceResult;
    insightSetId: string;
    insightName: InsightName;
  } | null = null;

  appendResponseLine(value: string): void {
    this.#lines.push(value);
  }

  attachTraceSummary(trace: TraceResult): void {
    this.#traceSummary = trace;
  }

  attachTraceInsight(
    trace: TraceResult,
    insightSetId: string,
    insightName: InsightName,
  ): void {
    this.#traceInsight = {trace, insightSetId, insightName};
  }

  // Stub methods for Response interface compatibility (Plan 2 tools)
  setIncludePages(_value: boolean): void {}
  setIncludeConsoleData(
    _value: boolean,
    _options?: unknown,
  ): void {}
  includeSnapshot(_params?: unknown): void {}
  attachImage(_value: {data: string; mimeType: string}): void {}

  handle(toolName: string): {content: TextContent[]} {
    const content: TextContent[] = [];

    // Add text lines
    for (const line of this.#lines) {
      content.push({type: 'text', text: line});
    }

    // Add trace summary
    if (this.#traceSummary) {
      const summary = getTraceSummary(this.#traceSummary);
      content.push({type: 'text', text: summary});
    }

    // Add trace insight
    if (this.#traceInsight) {
      const {trace, insightSetId, insightName} = this.#traceInsight;
      const output = getInsightOutput(trace, insightSetId, insightName);
      if ('output' in output) {
        content.push({type: 'text', text: output.output});
      } else {
        content.push({type: 'text', text: output.error});
      }
    }

    return {content};
  }
}
