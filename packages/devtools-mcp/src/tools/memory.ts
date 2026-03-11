/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';
import {notImplemented} from './stubs.js';

export const takeMemorySnapshot = definePageTool({
  name: 'take_memory_snapshot',
  description: `Capture a memory heapsnapshot of the currently selected page to memory leak debugging`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod
      .string()
      .describe('A path to a .heapsnapshot file to save the heapsnapshot to.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'take_memory_snapshot',
        'Heap snapshots require V8 HeapProfiler domain; JSC via the inspector proxy does not support this.',
      ),
    );
  },
});
