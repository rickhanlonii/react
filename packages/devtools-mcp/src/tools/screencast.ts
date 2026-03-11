/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';
import {notImplemented} from './stubs.js';

export const startScreencast = definePageTool({
  name: 'screencast_start',
  description:
    'Starts recording a screencast (video) of the selected page in mp4 format.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['screencast'],
  },
  schema: {
    path: zod
      .string()
      .optional()
      .describe(
        'Output path. Uses mkdtemp to generate a unique path if not provided.',
      ),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'screencast_start',
        'Video recording requires ffmpeg and Puppeteer\'s screencast API. Use take_screenshot for static captures.',
      ),
    );
  },
});

export const stopScreencast = definePageTool({
  name: 'screencast_stop',
  description: 'Stops the active screencast recording on the selected page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['screencast'],
  },
  schema: {},
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'screencast_stop',
        'Video recording requires ffmpeg and Puppeteer\'s screencast API. Use take_screenshot for static captures.',
      ),
    );
  },
});
