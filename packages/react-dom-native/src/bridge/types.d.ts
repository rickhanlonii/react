/**
 * TypeScript declarations for all $$ bridge globals.
 *
 * These globals are registered on the JSContext by NativeBridge.swift at
 * runtime. In tests they are replaced with jest mocks.
 */

// ---------------------------------------------------------------------------
// Opaque handle types
// ---------------------------------------------------------------------------

/** Opaque handle wrapping an immutable ShadowNode (Swift ShadowNodeWrapper). */
type ShadowNodeHandle = object;

/** Opaque handle wrapping a mutable child-set array. */
type ChildSetHandle = object;

/** React fiber reference used for event dispatch. */
type InstanceHandle = object;

// ---------------------------------------------------------------------------
// Node creation
// ---------------------------------------------------------------------------

declare function $$createNode(
  type: string,
  surfaceId: number,
  props: Record<string, any>,
  isInsideTextContext: boolean,
  instanceHandle: InstanceHandle,
): ShadowNodeHandle;

declare function $$createTextNode(
  text: string,
  surfaceId: number,
  instanceHandle: InstanceHandle,
): ShadowNodeHandle;

// ---------------------------------------------------------------------------
// Clone operations (persistent mode)
// ---------------------------------------------------------------------------

declare function $$cloneNode(node: ShadowNodeHandle): ShadowNodeHandle;

declare function $$cloneNodeWithNewProps(
  node: ShadowNodeHandle,
  newProps: Record<string, any>,
): ShadowNodeHandle;

declare function $$cloneNodeWithNewChildren(
  node: ShadowNodeHandle,
  children?: ShadowNodeHandle[],
): ShadowNodeHandle;

declare function $$cloneNodeWithNewChildrenAndProps(
  node: ShadowNodeHandle,
  children: ShadowNodeHandle[] | undefined,
  newProps: Record<string, any>,
): ShadowNodeHandle;

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

declare function $$appendChild(
  parentNode: ShadowNodeHandle,
  childNode: ShadowNodeHandle,
): void;

// ---------------------------------------------------------------------------
// Container operations
// ---------------------------------------------------------------------------

declare function $$createChildSet(): ChildSetHandle;

declare function $$appendChildToChildSet(
  childSet: ChildSetHandle,
  child: ShadowNodeHandle,
): void;

declare function $$completeRoot(
  surfaceId: number,
  childNodes: ShadowNodeHandle[],
): void;

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

declare function $$measureNode(
  node: ShadowNodeHandle,
  callback: (x: number, y: number, width: number, height: number) => void,
): void;

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

declare function $$registerEventHandler(
  handler: (
    instanceHandle: InstanceHandle,
    eventType: string,
    payload: Record<string, any>,
  ) => void,
): void;

// ---------------------------------------------------------------------------
// Event priority constants
// ---------------------------------------------------------------------------

declare const $$DefaultEventPriority: number;
declare const $$DiscreteEventPriority: number;
declare const $$ContinuousEventPriority: number;

// ---------------------------------------------------------------------------
// Networking (for Flight client)
// ---------------------------------------------------------------------------

declare function $$fetch(
  url: string,
  headers: Record<string, string>,
  callback: (type: 'data' | 'end' | 'error', payload: string) => void,
): void;
