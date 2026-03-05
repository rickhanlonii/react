/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as consoleTools from './console.js';
import * as emulationTools from './emulation.js';
import * as extensionsTools from './extensions.js';
import * as inputTools from './input.js';
import * as lighthouseTools from './lighthouse.js';
import * as memoryTools from './memory.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as screencastTools from './screencast.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
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
  const allValues = [
    ...Object.values(consoleTools),
    ...Object.values(performanceTools),
    ...Object.values(inputTools),
    ...Object.values(pagesTools),
    ...Object.values(networkTools),
    ...Object.values(emulationTools),
    ...Object.values(memoryTools),
    ...Object.values(lighthouseTools),
    ...Object.values(screencastTools),
    ...Object.values(extensionsTools),
    ...Object.values(screenshotTools),
    ...Object.values(scriptTools),
    ...Object.values(snapshotTools),
  ];

  const tools = allValues.filter(isToolDefinition);
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
};
