# Plan 1c: Performance Tracing

## Context

After Plan 1b establishes the CDP client and strips Puppeteer from the context layer, the performance tracing tools need to be adapted to use direct CDP commands instead of Puppeteer's `page.tracing.start()/stop()` API.

The inspector proxy (at `example/scripts/inspector-proxy.js`) supports:
- `Tracing.start` -- tells the app to start collecting trace events
- `Tracing.end` -- tells the app to stop, then emits chunked `Tracing.dataCollected` events followed by `Tracing.tracingComplete`

Trace data arrives chunked at `CHUNK_SIZE = 1000` events per `Tracing.dataCollected` message.

**Prerequisites**: Plan 1b (CDP client and context rewrite) must be complete.

## Goal

Working performance trace pipeline:
- `performance_start_trace` sends `Tracing.start` via CDPClient
- `performance_stop_trace` sends `Tracing.end`, collects chunked events, parses with TraceEngine
- `performance_analyze_insight` analyzes insights from the parsed trace
- Trace summary output matches the upstream format

## Steps

### 1. Add `parseTraceEvents()` to `src/trace-processing/parse.ts`

Add a new function that accepts a pre-parsed array of trace events (from `Tracing.dataCollected` chunks) instead of a `Uint8Array` buffer. Keep `parseRawTraceBuffer` for file-loading use cases.

```typescript
/**
 * Parse trace events from an already-parsed array (e.g. from
 * Tracing.dataCollected CDP events accumulated during a trace session).
 */
export async function parseTraceEvents(
  events: DevTools.TraceEngine.Types.Events.Event[],
): Promise<TraceResult | TraceParseError> {
  engine.resetProcessor();
  if (!events || events.length === 0) {
    return {
      error: 'No trace events were provided.',
    };
  }
  try {
    await engine.parse(events);
    const parsedTrace = engine.parsedTrace();
    if (!parsedTrace) {
      return {
        error: 'No parsed trace was returned from the trace engine.',
      };
    }
    const insights = parsedTrace?.insights ?? null;
    return {
      parsedTrace,
      insights,
    };
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger(`Unexpected error parsing trace events: ${errorText}`);
    return {
      error: errorText,
    };
  }
}
```

This is nearly identical to `parseRawTraceBuffer` but skips the buffer-to-string-to-JSON step since events are already parsed objects.

### 2. Rewrite `src/tools/performance.ts`

Replace Puppeteer tracing with CDP commands via `CDPClient`. The key challenge is the **async chunked trace flow**:

1. Register listeners for `Tracing.dataCollected` and `Tracing.tracingComplete` **before** sending `Tracing.end`
2. Send `Tracing.end`
3. The inspector proxy receives trace data from the app, splits into chunks of 1000 events each
4. Each chunk arrives as a `Tracing.dataCollected` event with `{params: {value: Event[]}}`
5. Accumulate all chunks into a single array
6. Wait for `Tracing.tracingComplete` event -- signals all chunks have been sent
7. Feed accumulated events to `parseTraceEvents()`

```typescript
// src/tools/performance.ts
import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';
import type {TraceResult} from '../trace-processing/parse.js';
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
    await cdpClient.send('Tracing.start', {});
    logger('CDP: Tracing.start sent');

    if (request.params.autoStop) {
      // Wait for activity then auto-stop
      await new Promise(resolve => setTimeout(resolve, 5_000));
      await stopTracingAndAppendOutput(response, context, request.params.filePath);
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
    await stopTracingAndAppendOutput(response, context, request.params.filePath);
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
    const traceComplete = new Promise<void>((resolve) => {
      // Listen for data chunks
      const dataListener = (params: Record<string, unknown>) => {
        const value = params.value as unknown[];
        if (value) {
          allEvents.push(...value);
        }
      };
      cdpClient.on('Tracing.dataCollected', dataListener);

      // Listen for completion signal
      const completeListener = () => {
        cdpClient.off('Tracing.dataCollected', dataListener);
        cdpClient.off('Tracing.tracingComplete', completeListener);
        resolve();
      };
      cdpClient.on('Tracing.tracingComplete', completeListener);
    });

    // Send the stop command
    logger('CDP: Sending Tracing.end');
    await cdpClient.send('Tracing.end', {});

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
    const result = await parseTraceEvents(allEvents as DevTools.TraceEngine.Types.Events.Event[]);
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
```

**Key changes from upstream:**
- `page.tracing.start()` replaced with `cdpClient.send('Tracing.start', {})`
- `page.tracing.stop()` replaced with async chunked flow (register listeners -> send `Tracing.end` -> accumulate chunks -> wait for `Tracing.tracingComplete`)
- Removed `reload` functionality (navigating `about:blank` and back) -- native app reload is separate
- Removed `populateCruxData()` call -- CrUX is not applicable to native apps
- Removed `isCruxEnabled()` check
- File saving uses `TextEncoder` to create buffer from JSON string instead of receiving raw buffer from Puppeteer
- Added `InsightName` import for the `analyzeInsight` handler

**Note on the `reload` parameter:** The schema still includes `reload` and `autoStop` for API compatibility, but `reload` is a no-op for the native app. The `autoStop` parameter works by waiting 5 seconds then auto-stopping.

### 3. Update imports in `performance.ts`

Ensure the file imports from the rewritten modules:
- `CDPClient` type (via `context.cdpClient`)
- `DevTools` from `../third_party/index.js` (for `TraceEngine.Types.Events.Event`)
- `InsightName` from `../trace-processing/parse.js`

### 4. Verify `parse.ts` exports

Ensure `parseTraceEvents` is exported alongside existing exports:
- `parseRawTraceBuffer` (kept for file-loading use cases)
- `parseTraceEvents` (new, for CDP chunked events)
- `traceResultIsSuccess`
- `getTraceSummary`
- `getInsightOutput`
- `TraceResult`, `TraceParseError`, `InsightName`, `InsightOutput` types

## Files Modified

| File | Action |
|---|---|
| `src/trace-processing/parse.ts` | Add `parseTraceEvents()` function |
| `src/tools/performance.ts` | Rewrite (CDP instead of Puppeteer tracing) |

## Testing & Verification

### Automated Tests

1. **Verify `parseTraceEvents` works with sample data:**
   ```bash
   cd tools/devtools-mcp && npm run build
   node -e "
     import {parseTraceEvents, traceResultIsSuccess} from './build/src/trace-processing/parse.js';
     // Minimal trace event set
     const events = [
       {cat: '__metadata', name: 'thread_name', ph: 'M', pid: 1, tid: 1, ts: 0, args: {name: 'CrRendererMain'}},
       {cat: 'disabled-by-default-devtools.timeline', name: 'TracingStartedInBrowser', ph: 'I', pid: 1, tid: 1, ts: 0, args: {data: {frames: [{processId: 1}]}}},
     ];
     const result = await parseTraceEvents(events);
     if (traceResultIsSuccess(result)) {
       console.log('PASS: parseTraceEvents returned valid TraceResult');
     } else {
       console.log('Result:', result);
       console.log('Note: minimal events may not produce a full parse, but function executed without crash');
     }
   "
   ```

2. **Verify performance tools compile:**
   ```bash
   cd tools/devtools-mcp && npx tsc --noEmit 2>&1 | grep -c "performance.ts" || echo "0 errors in performance.ts"
   ```

### Manual Tests

**Full end-to-end trace test** (requires running Falcon app + dev server):

1. Start the dev server: `cd example && npm run dev`
2. Launch the Falcon app in the simulator
3. Build the MCP server: `cd tools/devtools-mcp && npm run build`
4. Run a trace test similar to `test-trace.js`:
   ```bash
   node -e "
     import {CDPClient} from './build/src/cdp-client.js';
     import {parseTraceEvents, traceResultIsSuccess, getTraceSummary} from './build/src/trace-processing/parse.js';

     const client = new CDPClient('http://127.0.0.1:6001');
     await client.connect();

     // Start trace
     await client.send('Tracing.start', {});
     console.log('Tracing started, waiting 5s...');

     await new Promise(r => setTimeout(r, 5000));

     // Stop trace and collect events
     const allEvents = [];
     const done = new Promise(resolve => {
       client.on('Tracing.dataCollected', (params) => {
         allEvents.push(...params.value);
       });
       client.on('Tracing.tracingComplete', () => resolve());
     });
     await client.send('Tracing.end', {});
     await done;

     console.log('Received', allEvents.length, 'events');

     // Parse
     const result = await parseTraceEvents(allEvents);
     if (traceResultIsSuccess(result)) {
       const summary = getTraceSummary(result);
       console.log('Trace Summary:', summary.substring(0, 500));
       console.log('PASS: full trace pipeline works');
     } else {
       console.error('FAIL:', result.error);
     }

     client.close();
   "
   ```

5. Verify the trace summary contains meaningful data (React commit events, timing info)

**Trace file save test:**
- Run the same flow with `filePath` set to `/tmp/falcon-trace.json`
- Verify the file exists and contains valid JSON with `traceEvents` array
- Load in `chrome://tracing` to visually verify

### Regression Checks

- `npm test` from Falcon root still passes
- `example/scripts/test-trace.js` still works against the inspector proxy (unchanged)
- The inspector proxy itself is not modified

### Acceptance Criteria

- [ ] `parseTraceEvents()` exists in `src/trace-processing/parse.ts` and accepts `Event[]` arrays
- [ ] `parseRawTraceBuffer()` is preserved (not removed)
- [ ] `performance_start_trace` sends `Tracing.start` via CDP
- [ ] `performance_stop_trace` handles the async chunked flow correctly:
  - Registers `Tracing.dataCollected` + `Tracing.tracingComplete` listeners before sending `Tracing.end`
  - Accumulates all event chunks
  - Waits for `Tracing.tracingComplete` before parsing
- [ ] Trace events are parsed by `parseTraceEvents()` and produce a `TraceResult`
- [ ] `performance_analyze_insight` works with the stored trace result
- [ ] No references to `page.tracing`, `pptrPage`, or `populateCruxData` remain in `performance.ts`
- [ ] File saving works (both `.json` and `.json.gz` formats)
- [ ] Full end-to-end trace (start -> wait -> stop -> parse -> summary) produces meaningful output

## Dependencies

- **Plan 1a** must be complete (project scaffolded)
- **Plan 1b** must be complete (CDPClient exists, McpContext has `cdpClient` property, ToolDefinition has `Context.cdpClient`)

## Reference Files

| File | Purpose |
|---|---|
| `example/scripts/test-trace.js` | Working CDP trace flow: start, collect chunks, validate |
| `example/scripts/inspector-proxy.js` | Tracing domain handler, `CHUNK_SIZE = 1000` |
| `~/oss/chrome-devtools-mcp/src/tools/performance.ts` | Upstream Puppeteer-based tracing (lines 89-91 for `page.tracing.start()`, line 184 for `page.tracing.stop()`) |
| `~/oss/chrome-devtools-mcp/src/trace-processing/parse.ts` | Upstream parse functions and TraceEngine usage |
