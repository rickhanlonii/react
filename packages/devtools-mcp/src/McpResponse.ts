/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ImageContent, TextContent} from './third_party/index.js';
import type {Response} from './tools/ToolDefinition.js';
import type {InsightName, TraceResult} from './trace-processing/parse.js';
import {getInsightOutput, getTraceSummary} from './trace-processing/parse.js';

export class McpResponse implements Response {
  #lines: string[] = [];
  #images: ImageContent[] = [];
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

  /**
   * No-op: our list_pages tool formats output directly via appendResponseLine.
   * Retained for Response interface compatibility.
   */
  setIncludePages(_value: boolean): void {}

  /**
   * No-op: our console tools format output directly via appendResponseLine.
   * Retained for Response interface compatibility.
   */
  setIncludeConsoleData(
    _value: boolean,
    _options?: unknown,
  ): void {}

  /**
   * No-op: tools that support includeSnapshot (click, fill, etc.) handle
   * snapshot output directly via CDP + appendResponseLine.
   * Retained for Response interface compatibility.
   */
  includeSnapshot(_params?: unknown): void {}

  attachImage(value: {data: string; mimeType: string}): void {
    this.#images.push({
      type: 'image',
      data: value.data,
      mimeType: value.mimeType,
    });
  }

  handle(toolName: string): {content: (TextContent | ImageContent)[]} {
    const content: (TextContent | ImageContent)[] = [];

    // Add text lines
    for (const line of this.#lines) {
      content.push({type: 'text', text: line});
    }

    // Add images
    for (const image of this.#images) {
      content.push(image);
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
