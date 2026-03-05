/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type {CDPClient} from '../cdp-client.js';
import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, timeoutSchema} from './ToolDefinition.js';

/**
 * CDP DOM.Node structure as returned by DOM.getDocument.
 * nodeType: 1 = element, 3 = text, 9 = document.
 * nodeName is UPPERCASED for elements (e.g. "DIV", "BUTTON").
 * attributes is a flat [key, value, key, value, ...] string array.
 */
interface DOMNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: DOMNode[];
  attributes?: string[];
}

/** Global UID -> backendNodeId map, refreshed on each take_snapshot call. */
const uidToBackendNodeId = new Map<string, number>();

/**
 * Retrieve the backendNodeId for a UID string assigned during the last snapshot.
 */
export function getBackendNodeIdForUid(uid: string): number | undefined {
  return uidToBackendNodeId.get(uid);
}

// ---------------------------------------------------------------------------
// Helper: recursively extract all text content from a DOM tree
// ---------------------------------------------------------------------------
function extractTextContent(node: DOMNode): string {
  if (node.nodeType === 3) {
    return node.nodeValue || '';
  }
  let text = '';
  for (const child of node.children || []) {
    text += extractTextContent(child);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Helper: format a DOM tree as a readable text snapshot
// ---------------------------------------------------------------------------
function formatDOMTree(
  node: DOMNode,
  depth: number,
  uidMap: Map<string, number>,
  verbose: boolean,
): string {
  const indent = '  '.repeat(depth);
  const uid = String(node.nodeId);
  uidMap.set(uid, node.backendNodeId);

  // Document node (nodeType 9): just recurse into children
  if (node.nodeType === 9) {
    const chunks: string[] = [];
    for (const child of node.children || []) {
      chunks.push(formatDOMTree(child, depth, uidMap, verbose));
    }
    return chunks.join('');
  }

  // Text node (nodeType 3)
  if (node.nodeType === 3) {
    const text = node.nodeValue || '';
    if (!text.trim()) {
      return '';
    }
    return `${indent}- "${text}" [uid="${uid}"]\n`;
  }

  // Element node (nodeType 1)
  const tagName = node.nodeName.toLowerCase();

  // Parse attributes from the flat array
  const attrs: string[] = [];
  const rawAttrs = node.attributes || [];
  for (let i = 0; i < rawAttrs.length; i += 2) {
    const key = rawAttrs[i];
    const value = rawAttrs[i + 1];
    if (key === undefined) {
      break;
    }
    // Skip event handler attributes in non-verbose mode
    if (!verbose && key.startsWith('on') && value === 'true') {
      continue;
    }
    attrs.push(`${key}="${value}"`);
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  let line = `${indent}- ${tagName} [uid="${uid}"]${attrStr}\n`;

  // Recurse into children
  for (const child of node.children || []) {
    line += formatDOMTree(child, depth + 1, uidMap, verbose);
  }

  return line;
}

// ---------------------------------------------------------------------------
// Helper: fetch full DOM tree and format it
// ---------------------------------------------------------------------------
async function fetchAndFormatSnapshot(
  cdpClient: CDPClient,
  verbose: boolean,
): Promise<string> {
  logger('CDP: DOM.getDocument (depth: -1)');
  const result = (await cdpClient.send('DOM.getDocument', {
    depth: -1,
  })) as {root: DOMNode};

  // Clear and rebuild the UID map
  uidToBackendNodeId.clear();

  const output = formatDOMTree(result.root, 0, uidToBackendNodeId, verbose);
  return output;
}

// ---------------------------------------------------------------------------
// take_snapshot tool
// ---------------------------------------------------------------------------
export const takeSnapshot = definePageTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    verbose: zod
      .boolean()
      .optional()
      .describe(
        'Whether to include all possible information available in the full a11y tree. Default is false.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.',
      ),
  },
  handler: async (request, response, context) => {
    const verbose = request.params.verbose ?? false;
    const snapshot = await fetchAndFormatSnapshot(context.cdpClient, verbose);

    if (request.params.filePath) {
      const filePath = path.resolve(request.params.filePath);
      await fs.mkdir(path.dirname(filePath), {recursive: true});
      await fs.writeFile(filePath, snapshot, 'utf-8');
      response.appendResponseLine(`Snapshot saved to ${filePath}`);
    } else {
      response.appendResponseLine(snapshot);
    }
  },
});

// ---------------------------------------------------------------------------
// wait_for tool
// ---------------------------------------------------------------------------
export const waitFor = definePageTool({
  name: 'wait_for',
  description: `Wait for the specified text to appear on the selected page.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {
    text: zod
      .array(zod.string())
      .min(1)
      .describe(
        'Non-empty list of texts. Resolves when any value appears on the page.',
      ),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const texts = request.params.text;
    const timeout = request.params.timeout ?? 30000;
    const pollInterval = 500;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        logger('CDP: DOM.getDocument (wait_for poll)');
        const result = (await context.cdpClient.send('DOM.getDocument', {
          depth: -1,
        })) as {root: DOMNode};

        const allText = extractTextContent(result.root);
        for (const text of texts) {
          if (allText.includes(text)) {
            response.appendResponseLine(
              `Element matching one of ${JSON.stringify(texts)} found.`,
            );
            // Take a fresh snapshot so UIDs are available
            const snapshot = await fetchAndFormatSnapshot(
              context.cdpClient,
              false,
            );
            response.appendResponseLine(snapshot);
            return;
          }
        }
      } catch (err) {
        // DOM.getDocument may fail transiently during reload; keep polling
        logger(`wait_for: DOM.getDocument error (will retry): ${err}`);
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error(
      `Timed out after ${timeout}ms waiting for text: ${texts.join(', ')}`,
    );
  },
});
