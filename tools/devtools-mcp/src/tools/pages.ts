/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {notImplemented} from './stubs.js';

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

export const closePage = defineTool({
  name: 'close_page',
  description: `Closes the page by its index. The last open page cannot be closed.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    pageId: zod
      .number()
      .describe('The ID of the page to close. Call list_pages to list pages.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'close_page',
        'Cannot close a native app page via CDP.',
      ),
    );
  },
});

export const newPage = defineTool({
  name: 'new_page',
  description: `Creates a new page`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('URL to load in a new page.'),
    background: zod
      .boolean()
      .optional()
      .describe(
        'Whether to open the page in the background without bringing it to the front. Default is false (foreground).',
      ),
    isolatedContext: zod
      .string()
      .optional()
      .describe(
        'If specified, the page is created in an isolated browser context with the given name. ' +
          'Pages in the same browser context share cookies and storage. ' +
          'Pages in different browser contexts are fully isolated.',
      ),
    timeout: zod
      .number()
      .int()
      .optional()
      .describe(
        `Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`,
      ),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'new_page',
        'Cannot open new pages in a native app.',
      ),
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
  handler: async (_request, _response, _context) => {
    throw new Error('navigate_page is not yet implemented for this target.');
  },
});

export const resizePage = defineTool({
  name: 'resize_page',
  description: `Resizes the selected page's window so that the page has specified dimension`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    width: zod.number().describe('Page width'),
    height: zod.number().describe('Page height'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'resize_page',
        'Simulator window size is fixed; cannot resize via CDP.',
      ),
    );
  },
});

export const handleDialog = defineTool({
  name: 'handle_dialog',
  description: `If a browser dialog was opened, use this command to handle it`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    action: zod
      .enum(['accept', 'dismiss'])
      .describe('Whether to dismiss or accept the dialog'),
    promptText: zod
      .string()
      .optional()
      .describe('Optional prompt text to enter into the dialog.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'handle_dialog',
        'Native apps do not produce browser dialogs (alert/confirm/prompt via DOM). UIAlertController is not accessible via CDP.',
      ),
    );
  },
});

export const getTabId = defineTool({
  name: 'get_tab_id',
  description: `Get the tab ID of the page`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
    conditions: ['experimentalInteropTools'],
  },
  schema: {
    pageId: zod
      .number()
      .describe(
        `The ID of the page to get the tab ID for. Call list_pages to get available pages.`,
      ),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'get_tab_id',
        'No browser tabs in a native app.',
      ),
    );
  },
});
