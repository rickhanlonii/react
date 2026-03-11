/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPClient} from '../cdp-client.js';
import type {ParsedArguments} from '../cli.js';
import type {McpPage} from '../McpPage.js';
import {zod} from '../third_party/index.js';
import type {InsightName, TraceResult} from '../trace-processing/parse.js';

import type {ToolCategory} from './categories.js';

export interface BaseToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> {
  name: string;
  description: string;
  annotations: {
    title?: string;
    category: ToolCategory;
    /**
     * If true, the tool does not modify its environment.
     */
    readOnlyHint: boolean;
    conditions?: string[];
  };
  schema: Schema;
}

export interface ToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  schema: Schema;
  handler: (
    request: Request<Schema>,
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export interface Request<Schema extends zod.ZodRawShape> {
  params: zod.objectOutputType<Schema, zod.ZodTypeAny>;
}

export interface Response {
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeConsoleData(
    value: boolean,
    options?: unknown,
  ): void;
  includeSnapshot(params?: unknown): void;
  attachImage(value: {data: string; mimeType: string}): void;
  attachTraceSummary(trace: TraceResult): void;
  attachTraceInsight(
    trace: TraceResult,
    insightSetId: string,
    insightName: InsightName,
  ): void;
}

/**
 * Only add methods required by tools/*.
 */
export type Context = Readonly<{
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
  recordedTraces(): TraceResult[];
  storeTraceRecording(result: TraceResult): void;
  getSelectedMcpPage(): ContextPage;
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}>;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}>;
  cdpClient: CDPClient;
}>;

export type ContextPage = Readonly<{
  readonly id: number;
}>;

export function defineTool<Schema extends zod.ZodRawShape>(
  definition: ToolDefinition<Schema>,
): ToolDefinition<Schema>;

export function defineTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition: (args?: Args) => ToolDefinition<Schema>,
): (args?: Args) => ToolDefinition<Schema>;

export function defineTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition:
    | ToolDefinition<Schema>
    | ((args?: Args) => ToolDefinition<Schema>),
) {
  if (typeof definition === 'function') {
    const factory = definition;
    return (args: Args) => {
      return factory(args);
    };
  }
  return definition;
}

interface PageToolDefinition<
  Schema extends zod.ZodRawShape = zod.ZodRawShape,
> extends BaseToolDefinition<Schema> {
  handler: (
    request: Request<Schema> & {page: ContextPage},
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export type DefinedPageTool<Schema extends zod.ZodRawShape = zod.ZodRawShape> =
  PageToolDefinition<Schema> & {
    pageScoped: true;
    handler: (
      request: Request<Schema> & {page: ContextPage},
      response: Response,
      context: Context,
    ) => Promise<void>;
  };

export function definePageTool<Schema extends zod.ZodRawShape>(
  definition: PageToolDefinition<Schema>,
): DefinedPageTool<Schema>;

export function definePageTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition: (args?: Args) => PageToolDefinition<Schema>,
): (args?: Args) => DefinedPageTool<Schema>;

export function definePageTool<
  Schema extends zod.ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(
  definition:
    | PageToolDefinition<Schema>
    | ((args?: Args) => PageToolDefinition<Schema>),
): DefinedPageTool<Schema> | ((args?: Args) => DefinedPageTool<Schema>) {
  if (typeof definition === 'function') {
    return (args?: Args): DefinedPageTool<Schema> => {
      const tool = definition(args);
      return {
        ...tool,
        pageScoped: true,
      };
    };
  }

  return {
    ...definition,
    pageScoped: true,
  } as DefinedPageTool<Schema>;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

export const pageIdSchema = {
  pageId: zod.number().optional().describe('Targets a specific page by ID.'),
};

export const timeoutSchema = {
  timeout: zod
    .number()
    .int()
    .optional()
    .describe(
      `Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`,
    )
    .transform(value => {
      return value && value <= 0 ? undefined : value;
    }),
};
