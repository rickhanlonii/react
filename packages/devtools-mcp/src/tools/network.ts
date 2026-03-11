/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

// ---------------------------------------------------------------------------
// Network request types
// ---------------------------------------------------------------------------

interface StoredNetworkRequest {
  reqId: number;
  requestId: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number;
  responseHeaders: Record<string, string>;
  mimeType: string;
  body: string | null;
  base64Encoded: boolean;
  startTime: number;
  duration: number;
  size: number;
  error: string | null;
  finished: boolean;
  initiator: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ---------------------------------------------------------------------------
// list_network_requests tool
// ---------------------------------------------------------------------------

export const listNetworkRequests = definePageTool({
  name: 'list_network_requests',
  description:
    'List all network requests captured since the app started. Shows URL, method, status, duration, and size for each request.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to return. When omitted, returns all requests.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    urlFilter: zod
      .string()
      .optional()
      .describe(
        'Filter requests by URL substring match (case-insensitive).',
      ),
    methodFilter: zod
      .string()
      .optional()
      .describe(
        'Filter requests by HTTP method (e.g. "GET", "POST").',
      ),
    initiatorFilter: zod
      .enum(['parser', 'script'])
      .optional()
      .describe(
        'Filter by request initiator: "parser" for native URLSession requests, "script" for JavaScript fetch() calls.',
      ),
  },
  handler: async (request, response, context) => {
    // Query the proxy for stored requests
    const result = (await context.cdpClient.send('Network.getRequests', {})) as {requests?: StoredNetworkRequest[]};
    let requests = result.requests || [];

    // Apply filters
    const {urlFilter, methodFilter, initiatorFilter} = request.params;
    if (urlFilter) {
      const lower = urlFilter.toLowerCase();
      requests = requests.filter(r => r.url.toLowerCase().includes(lower));
    }
    if (methodFilter) {
      const upper = methodFilter.toUpperCase();
      requests = requests.filter(r => r.method === upper);
    }
    if (initiatorFilter) {
      requests = requests.filter(r => r.initiator === initiatorFilter);
    }

    const total = requests.length;

    if (total === 0) {
      response.appendResponseLine('No network requests captured.');
      return;
    }

    // Apply pagination
    const pageSize = request.params.pageSize;
    const pageIdx = request.params.pageIdx ?? 0;

    let paginatedRequests = requests;
    if (pageSize !== undefined) {
      const start = pageIdx * pageSize;
      paginatedRequests = requests.slice(start, start + pageSize);
    }

    response.appendResponseLine(`Network requests (${total} total):`);
    for (const req of paginatedRequests) {
      const status = req.error
        ? 'FAILED'
        : req.finished
          ? String(req.statusCode)
          : 'pending';
      const timing = req.finished ? formatDuration(req.duration) : '...';
      const size = req.finished ? formatSize(req.size) : '...';
      const initiatorTag = req.initiator === 'script' ? '  [script]' : '';
      const errorTag = req.error ? ` (${req.error})` : '';

      response.appendResponseLine(
        `[req=${req.reqId}] ${req.method} ${req.url} → ${status} (${timing}, ${size})${initiatorTag}${errorTag}`,
      );
    }

    if (pageSize !== undefined) {
      const totalPages = Math.ceil(total / pageSize);
      response.appendResponseLine(`\nPage ${pageIdx + 1} of ${totalPages}`);
    }
  },
});

// ---------------------------------------------------------------------------
// get_network_request tool
// ---------------------------------------------------------------------------

export const getNetworkRequest = definePageTool({
  name: 'get_network_request',
  description:
    'Get detailed information about a specific network request including headers and response body.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    reqid: zod
      .number()
      .describe(
        'The reqid of the network request from list_network_requests output.',
      ),
  },
  handler: async (request, response, context) => {
    const reqId = request.params.reqid;

    const result = (await context.cdpClient.send('Network.getRequestByReqId', {
      reqId,
    })) as {request?: StoredNetworkRequest | null};
    const req = result.request ?? null;

    if (!req) {
      throw new Error(
        `Network request with reqid ${reqId} not found. Use list_network_requests to see available requests.`,
      );
    }

    const status = req.error
      ? 'FAILED'
      : req.finished
        ? String(req.statusCode)
        : 'pending';

    response.appendResponseLine(
      `Request #${req.reqId}: ${req.method} ${req.url}`,
    );
    response.appendResponseLine(
      `Duration: ${req.finished ? formatDuration(req.duration) : 'pending'} | Status: ${status} | Size: ${req.finished ? formatSize(req.size) : 'pending'} | Initiator: ${req.initiator}`,
    );

    // Request headers
    response.appendResponseLine('');
    response.appendResponseLine('Request Headers:');
    const reqHeaders = req.requestHeaders || {};
    if (Object.keys(reqHeaders).length === 0) {
      response.appendResponseLine('  (none)');
    } else {
      for (const [key, value] of Object.entries(reqHeaders)) {
        response.appendResponseLine(`  ${key}: ${value}`);
      }
    }

    // Request body
    if (req.requestBody) {
      response.appendResponseLine('');
      response.appendResponseLine('Request Body:');
      response.appendResponseLine(req.requestBody);
    }

    // Response headers
    response.appendResponseLine('');
    response.appendResponseLine('Response Headers:');
    const resHeaders = req.responseHeaders || {};
    if (Object.keys(resHeaders).length === 0) {
      response.appendResponseLine('  (none)');
    } else {
      for (const [key, value] of Object.entries(resHeaders)) {
        response.appendResponseLine(`  ${key}: ${value}`);
      }
    }

    // Response body
    if (req.body) {
      response.appendResponseLine('');
      if (req.base64Encoded) {
        response.appendResponseLine(
          `Response Body (base64, ${formatSize(req.size)}):`,
        );
        // Show first 200 chars of base64 to avoid flooding
        const preview =
          req.body.length > 200
            ? req.body.substring(0, 200) + '...'
            : req.body;
        response.appendResponseLine(preview);
      } else {
        const MAX_BODY = 5000;
        const truncated = req.body.length > MAX_BODY;
        response.appendResponseLine(
          `Response Body${truncated ? ` (first ${MAX_BODY} chars of ${formatSize(req.size)})` : ''}:`,
        );
        response.appendResponseLine(
          truncated ? req.body.substring(0, MAX_BODY) + '...' : req.body,
        );
      }
    }
  },
});
