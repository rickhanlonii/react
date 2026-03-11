/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const listPages = defineTool({
  name: 'list_pages',
  description: `Get a list of pages open in the browser.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const targets = await context.cdpClient.discoverTargets();
    const pages = targets.filter(t => t.type === 'page');

    if (pages.length === 0) {
      response.appendResponseLine('No pages found.');
      return;
    }

    response.appendResponseLine(`Found ${pages.length} page(s):`);
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      response.appendResponseLine(
        `  [${i}] ${page.title || '(untitled)'} — ${page.url}`,
      );
    }
  },
});

export const selectPage = defineTool({
  name: 'select_page',
  description: `Select a page as a context for future tool calls.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {
    pageId: zod
      .number()
      .describe(
        'The ID of the page to select. Call list_pages to get available pages.',
      ),
    bringToFront: zod
      .boolean()
      .optional()
      .describe('Whether to focus the page and bring it to the top.'),
  },
  handler: async (request, response, context) => {
    const targets = await context.cdpClient.discoverTargets();
    const pages = targets.filter(t => t.type === 'page');

    const index = request.params.pageId;
    if (index < 0 || index >= pages.length) {
      throw new Error(
        `Invalid pageId ${index}. Use list_pages to see available pages (0-${pages.length - 1}).`,
      );
    }

    const target = pages[index];
    logger(`CDP: Switching to target "${target.title}" (${target.id})`);

    // Reconnect the CDP client to the selected target's WebSocket URL
    context.cdpClient.close();
    await context.cdpClient.connectToUrl(target.webSocketDebuggerUrl);

    response.appendResponseLine(
      `Selected page [${index}]: ${target.title || '(untitled)'} — ${target.url}`,
    );
  },
});

export const navigatePage = defineTool({
  name: 'navigate_page',
  description: `Navigates the currently selected page to a URL.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    type: zod
      .enum(['url', 'back', 'forward', 'reload'])
      .optional()
      .describe(
        'Navigate the page by URL, back or forward in history, or reload.',
      ),
    url: zod.string().optional().describe('Target URL (only type=url)'),
    ignoreCache: zod
      .boolean()
      .optional()
      .describe('Whether to ignore cache on reload.'),
    handleBeforeUnload: zod
      .enum(['accept', 'decline'])
      .optional()
      .describe(
        'Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept.',
      ),
    initScript: zod
      .string()
      .optional()
      .describe(
        'A JavaScript script to be executed on each new document before any other scripts for the next navigation.',
      ),
    timeout: zod
      .number()
      .int()
      .optional()
      .describe(
        `Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`,
      ),
  },
  handler: async (request, response, context) => {
    const type = request.params.type ?? 'reload';

    switch (type) {
      case 'reload': {
        const params: Record<string, unknown> = {};
        if (request.params.ignoreCache) {
          params.ignoreCache = true;
        }
        logger('CDP: Page.reload');
        await context.cdpClient.send('Page.reload', params);
        response.appendResponseLine('Successfully reloaded the page.');
        break;
      }
      case 'url': {
        response.appendResponseLine(
          'URL navigation is not supported for native apps. Use reload to refresh the current view.',
        );
        break;
      }
      case 'back':
      case 'forward': {
        response.appendResponseLine(
          `Navigation "${type}" is not supported. Native apps do not have browser-style navigation history.`,
        );
        break;
      }
    }
  },
});

