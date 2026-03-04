/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
import type {DefinedPageTool, ToolDefinition} from './ToolDefinition.js';

type AnyTool = ToolDefinition | DefinedPageTool;

export const createTools = (): AnyTool[] => {
  const tools = [
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
  ] as unknown as AnyTool[];

  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
};
