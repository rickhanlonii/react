/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,
so returned values have to be JSON-serializable.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    function: zod.string().describe(
      `A JavaScript function declaration to be executed by the tool in the currently selected page.
Example without arguments: \`() => {
  return document.title
}\` or \`async () => {
  return await fetch("example.com")
}\`.
Example with arguments: \`(el) => {
  return el.innerText;
}\`
`,
    ),
    args: zod
      .array(
        zod.object({
          uid: zod
            .string()
            .describe(
              'The uid of an element on the page from the page content snapshot',
            ),
        }),
      )
      .optional()
      .describe(`An optional list of arguments to pass to the function.`),
  },
  handler: async (request, response, context) => {
    const {args: uidArgs, function: fnString} = request.params;

    // Args path: UIDs require snapshot support (Plan 2C)
    if (uidArgs && uidArgs.length > 0) {
      throw new Error(
        'UIDs require prior take_snapshot which is not yet supported.',
      );
    }

    // No-args path: evaluate via CDP Runtime.evaluate
    const expression = `(${fnString})()`;
    logger(`CDP: Runtime.evaluate expression`);

    const result = (await context.cdpClient.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: {type?: string; value?: unknown; description?: string};
      exceptionDetails?: {text?: string; exception?: {description?: string}};
    };

    if (result.exceptionDetails) {
      const errorMsg =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Unknown error during evaluation';
      throw new Error(errorMsg);
    }

    const value = result.result?.value;
    const serialized =
      value !== undefined ? JSON.stringify(value) : 'undefined';

    response.appendResponseLine('Script ran on page and returned:');
    response.appendResponseLine('```json');
    response.appendResponseLine(serialized);
    response.appendResponseLine('```');
  },
});
