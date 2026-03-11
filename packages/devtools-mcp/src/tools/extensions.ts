/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {notImplemented} from './stubs.js';

const EXTENSIONS_CONDITION = 'experimentalExtensionSupport';

export const installExtension = defineTool({
  name: 'install_extension',
  description: 'Installs a Chrome extension from the given path.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {
    path: zod
      .string()
      .describe('Absolute path to the unpacked extension folder.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'install_extension',
        'Chrome extensions are not applicable to native iOS apps.',
      ),
    );
  },
});

export const uninstallExtension = defineTool({
  name: 'uninstall_extension',
  description: 'Uninstalls a Chrome extension by its ID.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {
    id: zod.string().describe('ID of the extension to uninstall.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'uninstall_extension',
        'Chrome extensions are not applicable to native iOS apps.',
      ),
    );
  },
});

export const listExtensions = defineTool({
  name: 'list_extensions',
  description:
    'Lists all extensions via this server, including their name, ID, version, and enabled status.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: true,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {},
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'list_extensions',
        'Chrome extensions are not applicable to native iOS apps.',
      ),
    );
  },
});

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: 'Reloads an unpacked Chrome extension by its ID.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {
    id: zod.string().describe('ID of the extension to reload.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'reload_extension',
        'Chrome extensions are not applicable to native iOS apps.',
      ),
    );
  },
});

export const triggerExtensionAction = defineTool({
  name: 'trigger_extension_action',
  description: 'Triggers an action in a Chrome extension.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    conditions: [EXTENSIONS_CONDITION],
  },
  schema: {
    id: zod.string().describe('ID of the extension.'),
  },
  handler: async (_request, response) => {
    response.appendResponseLine(
      notImplemented(
        'trigger_extension_action',
        'Chrome extensions are not applicable to native iOS apps.',
      ),
    );
  },
});
