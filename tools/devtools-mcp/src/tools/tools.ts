/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as performanceTools from './performance.js';
import type {DefinedPageTool, ToolDefinition} from './ToolDefinition.js';

type AnyTool = ToolDefinition | DefinedPageTool;

export const createTools = (): AnyTool[] => {
  const tools = Object.values(performanceTools) as unknown as AnyTool[];

  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
};
