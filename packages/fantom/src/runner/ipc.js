'use strict';

/**
 * Parses JSON test results from FantomTester stdout.
 * Handles edge cases like non-JSON lines, partial output, etc.
 *
 * @param {string} stdout - Raw stdout from FantomTester
 * @returns {{ passed: number, failed: number, errors: Array }}
 */
function parseResults(stdout) {
  if (!stdout || !stdout.trim()) {
    return {passed: 0, failed: 0, errors: []};
  }

  // Try parsing the entire output as JSON first
  var trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    // Fall through to line-by-line parsing
  }

  // Try each line (FantomTester may output debug info before JSON)
  var lines = trimmed.split('\n');
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = lines[i].trim();
    if (line.startsWith('{')) {
      try {
        return JSON.parse(line);
      } catch (_e2) {
        continue;
      }
    }
  }

  // Could not parse any results
  return {
    passed: 0,
    failed: 1,
    errors: [
      {
        suite: 'FantomTester',
        test: 'output parsing',
        error: 'Could not parse test results from FantomTester output',
        stack: 'Raw output: ' + trimmed.substring(0, 500),
      },
    ],
  };
}

module.exports = {parseResults: parseResults};
