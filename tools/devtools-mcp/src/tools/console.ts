/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPClient} from '../cdp-client.js';
import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

// ---------------------------------------------------------------------------
// Console message storage
// ---------------------------------------------------------------------------

export interface StoredConsoleMessage {
  msgid: number;
  type: string; // 'log', 'warn', 'error', 'info', 'debug', etc.
  text: string;
  timestamp: number;
  args: Array<{type: string; value?: unknown; description?: string}>;
}

const consoleMessages: StoredConsoleMessage[] = [];
let nextMsgId = 0;
let subscribed = false;

/**
 * Subscribe to Runtime.consoleAPICalled events on the given CDPClient.
 * Safe to call multiple times (will only subscribe once).
 */
export function subscribeToConsoleEvents(cdpClient: CDPClient): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  cdpClient.on(
    'Runtime.consoleAPICalled',
    (params: Record<string, unknown>) => {
      const type = (params.type as string) || 'log';
      const rawArgs = (params.args as Array<Record<string, unknown>>) || [];
      const timestamp = (params.timestamp as number) || Date.now();

      // Build text representation from args
      const textParts: string[] = [];
      const storedArgs: StoredConsoleMessage['args'] = [];

      for (const arg of rawArgs) {
        const argType = (arg.type as string) || 'undefined';
        const value = arg.value;
        const description = arg.description as string | undefined;

        if (description) {
          textParts.push(description);
        } else if (value !== undefined) {
          textParts.push(
            typeof value === 'string' ? value : JSON.stringify(value),
          );
        } else {
          textParts.push(argType);
        }

        storedArgs.push({type: argType, value, description});
      }

      const message: StoredConsoleMessage = {
        msgid: nextMsgId++,
        type,
        text: textParts.join(' '),
        timestamp,
        args: storedArgs,
      };

      consoleMessages.push(message);
      logger(`Console [${type}]: ${message.text}`);
    },
  );

  // Enable Runtime domain to start receiving events
  cdpClient.send('Runtime.enable', {}).catch((err: unknown) => {
    logger(`Failed to enable Runtime domain: ${err}`);
  });
}

// ---------------------------------------------------------------------------
// Console message type filter
// ---------------------------------------------------------------------------

type ConsoleResponseType =
  | 'log'
  | 'debug'
  | 'info'
  | 'error'
  | 'warn'
  | 'dir'
  | 'dirxml'
  | 'table'
  | 'trace'
  | 'clear'
  | 'startGroup'
  | 'startGroupCollapsed'
  | 'endGroup'
  | 'assert'
  | 'profile'
  | 'profileEnd'
  | 'count'
  | 'timeEnd'
  | 'verbose'
  | 'issue';

const FILTERABLE_MESSAGE_TYPES: [
  ConsoleResponseType,
  ...ConsoleResponseType[],
] = [
  'log',
  'debug',
  'info',
  'error',
  'warn',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'assert',
  'profile',
  'profileEnd',
  'count',
  'timeEnd',
  'verbose',
  'issue',
];

// ---------------------------------------------------------------------------
// list_console_messages tool
// ---------------------------------------------------------------------------

export const listConsoleMessages = definePageTool({
  name: 'list_console_messages',
  description:
    'List all console messages for the currently selected page since the last navigation.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return. When omitted, returns all requests.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe(
        'Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.',
      ),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set to true to return the preserved messages over the last 3 navigations.',
      ),
  },
  handler: async (request, response) => {
    // Filter by type if specified
    let messages = consoleMessages;
    const types = request.params.types;
    if (types && types.length > 0) {
      const typeSet = new Set(types);
      messages = messages.filter(m => typeSet.has(m.type as ConsoleResponseType));
    }

    const total = messages.length;

    // Apply pagination
    const pageSize = request.params.pageSize;
    const pageIdx = request.params.pageIdx ?? 0;

    let paginatedMessages = messages;
    if (pageSize !== undefined) {
      const start = pageIdx * pageSize;
      paginatedMessages = messages.slice(start, start + pageSize);
    }

    if (total === 0) {
      response.appendResponseLine('No console messages.');
      return;
    }

    response.appendResponseLine(`Console messages (${total} total):`);
    for (const msg of paginatedMessages) {
      response.appendResponseLine(`[${msg.msgid}] ${msg.type}: ${msg.text}`);
    }

    if (pageSize !== undefined) {
      const totalPages = Math.ceil(total / pageSize);
      response.appendResponseLine(
        `\nPage ${pageIdx + 1} of ${totalPages}`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// get_console_message tool
// ---------------------------------------------------------------------------

export const getConsoleMessage = definePageTool({
  name: 'get_console_message',
  description: `Gets a console message by its ID. You can get all messages by calling ${listConsoleMessages.name}.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    msgid: zod
      .number()
      .describe(
        'The msgid of a console message on the page from the listed console messages',
      ),
  },
  handler: async (request, response) => {
    const msgid = request.params.msgid;
    const message = consoleMessages.find(m => m.msgid === msgid);

    if (!message) {
      throw new Error(
        `Console message with msgid ${msgid} not found. Use list_console_messages to see available messages.`,
      );
    }

    response.appendResponseLine(`Message #${message.msgid}:`);
    response.appendResponseLine(`  Type: ${message.type}`);
    response.appendResponseLine(`  Text: ${message.text}`);
    response.appendResponseLine(
      `  Timestamp: ${new Date(message.timestamp).toISOString()}`,
    );

    if (message.args.length > 0) {
      response.appendResponseLine('  Arguments:');
      for (let i = 0; i < message.args.length; i++) {
        const arg = message.args[i];
        const valueStr =
          arg.value !== undefined
            ? JSON.stringify(arg.value)
            : arg.description || arg.type;
        response.appendResponseLine(`    [${i}] (${arg.type}) ${valueStr}`);
      }
    }
  },
});
