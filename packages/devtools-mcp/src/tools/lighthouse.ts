/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';
import {notImplemented} from './stubs.js';

export const lighthouseAudit = definePageTool({
  name: 'lighthouse_audit',
  description: `Get Lighthouse score and reports for accessibility, SEO and best practices.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    mode: zod
      .enum(['navigation', 'snapshot'])
      .default('navigation')
      .describe(
        '"navigation" reloads & audits. "snapshot" analyzes current state.',
      ),
    device: zod
      .enum(['desktop', 'mobile'])
      .default('desktop')
      .describe('Device to emulate.'),
    outputDirPath: zod
      .string()
      .optional()
      .describe('Directory for reports. If omitted, uses temporary files.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'lighthouse_audit',
        'Lighthouse audits are web-specific (accessibility, SEO, best practices for HTML pages). Not applicable to native app rendering.',
      ),
    );
  },
});
