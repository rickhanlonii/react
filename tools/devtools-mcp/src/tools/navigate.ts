/**
 * @license
 * Copyright 2026 Meta Platforms, Inc. and affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const navigateFixture = defineTool({
  name: 'navigate_fixture',
  description:
    'Navigates the Falcon demo app to a specific fixture with a specific rendering mode. ' +
    'Use this to switch between fixtures and variants (server, hydrated, ppr) without manual UI navigation.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    fixture: zod
      .string()
      .describe(
        'The fixture name to navigate to (e.g. "01-rsc-only", "06-kitchen-sink").',
      ),
    variant: zod
      .enum(['server', 'hydrated', 'ppr'])
      .optional()
      .describe(
        'The rendering mode variant. Defaults to "hydrated" if not specified.',
      ),
  },
  handler: async (request, response, context) => {
    const {fixture, variant} = request.params;
    const renderingMode = variant ?? 'hydrated';

    logger(
      `Navigating to fixture "${fixture}" with variant "${renderingMode}"`,
    );

    // Send FalconApp.navigate CDP command — the inspector proxy forwards this
    // to the app as a {type: "navigate-fixture"} message.
    await context.cdpClient.send('FalconApp.navigate', {
      fixture,
      variant: renderingMode,
    });

    // Wait for the app to navigate and render
    await new Promise(resolve => setTimeout(resolve, 3_000));

    response.appendResponseLine(
      `Navigated to fixture "${fixture}" with variant "${renderingMode}".`,
    );
  },
});
