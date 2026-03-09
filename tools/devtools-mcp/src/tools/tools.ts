/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as navigateTools from './navigate.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as snapshotTools from './snapshot.js';
import type {DefinedPageTool, ToolDefinition} from './ToolDefinition.js';

type AnyTool = ToolDefinition | DefinedPageTool;

function isToolDefinition(value: unknown): value is AnyTool {
  return (
    typeof value === 'object' &&
    value !== null &&
    'handler' in value &&
    'name' in value &&
    'schema' in value &&
    typeof (value as AnyTool).handler === 'function'
  );
}

export const createTools = (): AnyTool[] => {
  const allValues: unknown[] = [
    ...Object.values(navigateTools),
    ...Object.values(pagesTools),
    ...Object.values(performanceTools),
    ...Object.values(snapshotTools),
  ];

  const tools = allValues.filter(isToolDefinition);
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
};
