/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {
  McpServer,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import {subscribeToConsoleEvents} from './tools/console.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {VERSION} from './version.js';

export interface ServerArgs {
  proxyUrl: string;
  logFile?: string;
}

export async function createMcpServer(serverArgs: ServerArgs) {
  const server = new McpServer(
    {
      name: 'falcon_devtools',
      title: 'Falcon DevTools MCP server',
      version: VERSION,
    },
    {capabilities: {logging: {}}},
  );
  server.server.setRequestHandler(SetLevelRequestSchema, () => {
    return {};
  });

  const context = new McpContext(serverArgs.proxyUrl);

  // Subscribe to console events so messages are collected from the start.
  // The Runtime.enable call will trigger the CDP connection lazily on first send.
  subscribeToConsoleEvents(context.cdpClient);

  const toolMutex = new Mutex();

  function registerTool(tool: ToolDefinition | DefinedPageTool): void {
    // @ts-expect-error Type instantiation is excessively deep (MCP SDK generics).
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        const guard = await toolMutex.acquire();
        try {
          logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);

          const response = new McpResponse();

          if ('pageScoped' in tool && tool.pageScoped) {
            const page = context.getSelectedMcpPage();
            await tool.handler(
              {params, page},
              response,
              context,
            );
          } else {
            await tool.handler(
              // @ts-expect-error types do not match.
              {params},
              response,
              context,
            );
          }

          const {content} = response.handle(tool.name);
          return {content};
        } catch (err) {
          logger(`${tool.name} error:`, err);
          const errorText =
            err && 'message' in err ? err.message : String(err);
          return {
            content: [{type: 'text', text: errorText}],
            isError: true,
          };
        } finally {
          guard.dispose();
        }
      },
    );
  }

  const tools = createTools();
  for (const tool of tools) {
    registerTool(tool);
  }

  return {server};
}
