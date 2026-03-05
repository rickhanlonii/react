/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod, DevTools} from '../third_party/index.js';
import type {InsightName} from '../trace-processing/parse.js';
import {
  parseTraceEvents,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {definePageTool} from './ToolDefinition.js';

const filePathSchema = zod
  .string()
  .optional()
  .describe(
    'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
  );

export const startTrace = definePageTool({
  name: 'performance_start_trace',
  description: `Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    reload: zod
      .boolean()
      .describe(
        'Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the navigate_page tool BEFORE starting the trace if reload or autoStop is set to true.',
      ),
    autoStop: zod
      .boolean()
      .describe(
        'Determines if the trace recording should be automatically stopped.',
      ),
    filePath: filePathSchema,
  },
  handler: async (request, response, context) => {
    if (context.isRunningPerformanceTrace()) {
      response.appendResponseLine(
        'Error: a performance trace is already running. Use performance_stop_trace to stop it. Only one trace can be running at any given time.',
      );
      return;
    }
    context.setIsRunningPerformanceTrace(true);

    // Send Tracing.start via CDP
    const cdpClient = context.cdpClient;
    logger(`CDP: Client connected=${cdpClient.isConnected}`);
    await cdpClient.send('Tracing.start', {});
    logger('CDP: Tracing.start sent');

    if (request.params.reload) {
      // Trigger a page reload to capture render activity
      logger(`CDP: Before Page.reload, connected=${cdpClient.isConnected}`);
      await cdpClient.send('Page.reload', {});
      logger(`CDP: Page.reload sent, connected=${cdpClient.isConnected}`);
    }

    if (request.params.autoStop) {
      // Wait for activity then auto-stop
      logger('CDP: Waiting 5s for activity...');
      await new Promise(resolve => setTimeout(resolve, 5_000));
      logger(`CDP: After wait, connected=${cdpClient.isConnected}`);
      await stopTracingAndAppendOutput(
        response,
        context,
        request.params.filePath,
      );
    } else {
      response.appendResponseLine(
        'The performance trace is being recorded. Use performance_stop_trace to stop it.',
      );
    }
  },
});

export const stopTrace = definePageTool({
  name: 'performance_stop_trace',
  description:
    'Stops the active performance trace recording on the selected page.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    filePath: filePathSchema,
  },
  handler: async (request, response, context) => {
    if (!context.isRunningPerformanceTrace()) {
      return;
    }
    await stopTracingAndAppendOutput(
      response,
      context,
      request.params.filePath,
    );
  },
});

export const analyzeInsight = definePageTool({
  name: 'performance_analyze_insight',
  description:
    'Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    insightSetId: zod
      .string()
      .describe(
        'The id for the specific insight set. Only use the ids given in the "Available insight sets" list.',
      ),
    insightName: zod
      .string()
      .describe(
        'The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"',
      ),
  },
  handler: async (request, response, context) => {
    const lastRecording = context.recordedTraces().at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have Insights to analyze.',
      );
      return;
    }
    response.attachTraceInsight(
      lastRecording,
      request.params.insightSetId,
      request.params.insightName as InsightName,
    );
  },
});

/**
 * Stop tracing via CDP and collect chunked trace data.
 *
 * Flow:
 * 1. Register listeners for Tracing.dataCollected + Tracing.tracingComplete
 * 2. Send Tracing.end
 * 3. Accumulate Tracing.dataCollected chunks (each has {value: Event[]})
 * 4. Wait for Tracing.tracingComplete signal
 * 5. Parse accumulated events with TraceEngine
 */
async function stopTracingAndAppendOutput(
  response: Response,
  context: Context,
  filePath?: string,
): Promise<void> {
  const cdpClient = context.cdpClient;
  try {
    // Collect all trace events from chunked messages
    const allEvents: unknown[] = [];
    const traceComplete = new Promise<void>(resolve => {
      // Listen for data chunks
      const dataListener = (params: Record<string, unknown>) => {
        const value = params.value as unknown[];
        if (value) {
          logger(`CDP: Tracing.dataCollected chunk with ${value.length} events`);
          allEvents.push(...value);
        }
      };
      cdpClient.on('Tracing.dataCollected', dataListener);

      // Listen for completion signal
      const completeListener = () => {
        cdpClient.off('Tracing.dataCollected', dataListener);
        cdpClient.off('Tracing.tracingComplete', completeListener);
        logger('CDP: Tracing.tracingComplete received');
        resolve();
      };
      cdpClient.on('Tracing.tracingComplete', completeListener);
    });

    // Send the stop command
    logger('CDP: Sending Tracing.end');
    await cdpClient.send('Tracing.end', {});
    logger('CDP: Tracing.end response received');

    // Wait for all chunks + completion
    await traceComplete;
    logger(`CDP: Tracing complete, received ${allEvents.length} events`);

    // Optionally save raw trace data to file
    if (filePath && allEvents.length > 0) {
      const traceJson = JSON.stringify({traceEvents: allEvents});
      const buffer = new TextEncoder().encode(traceJson);
      let dataToWrite: Uint8Array = buffer;
      if (filePath.endsWith('.gz')) {
        const zlib = await import('node:zlib');
        dataToWrite = await new Promise((resolve, reject) => {
          zlib.gzip(buffer, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
        });
      }
      const file = await context.saveFile(dataToWrite, filePath);
      response.appendResponseLine(
        `The raw trace data was saved to ${file.filename}.`,
      );
    }

    // Parse trace events with TraceEngine
    const result = await parseTraceEvents(
      allEvents as DevTools.TraceEngine.Types.Events.Event[],
    );
    response.appendResponseLine('The performance trace has been stopped.');

    if (traceResultIsSuccess(result)) {
      context.storeTraceRecording(result);
      response.attachTraceSummary(result);
    } else {
      throw new Error(
        `There was an unexpected error parsing the trace: ${result.error}`,
      );
    }
  } finally {
    context.setIsRunningPerformanceTrace(false);
  }
}
