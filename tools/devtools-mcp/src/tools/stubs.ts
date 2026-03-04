/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns a descriptive "not supported" message for tools that can't work
 * with the react-dom-native inspector proxy.
 */
export function notImplemented(toolName: string, reason?: string): string {
  const base = `${toolName} is not supported for react-dom-native.`;
  return reason
    ? `${base} ${reason}`
    : `${base} The inspector proxy does not implement the required CDP domain.`;
}
