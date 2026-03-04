'use strict';

// react-dom-native Bridge Utilities
//
// This module re-exports the $$ bridge globals and provides helper constants.
// The actual $$ functions are registered on the JSContext by NativeBridge.swift
// at app startup. This module exists so that JS code can import bridge
// constants and utilities from a well-known package instead of relying on
// bare globals.

// ---------------------------------------------------------------------------
// Event priority constants
//
// These mirror React's lane priorities. The renderer's host config needs them
// for getCurrentUpdatePriority / resolveUpdatePriority. They are also exposed
// as globals ($$DefaultEventPriority etc.) by the native bridge so that the
// host config can reference them without importing this module.
// ---------------------------------------------------------------------------

const DefaultEventPriority = 32; // DefaultLane
const DiscreteEventPriority = 2; // SyncLane
const ContinuousEventPriority = 8; // InputContinuousLane

exports.DefaultEventPriority = DefaultEventPriority;
exports.DiscreteEventPriority = DiscreteEventPriority;
exports.ContinuousEventPriority = ContinuousEventPriority;

// ---------------------------------------------------------------------------
// Bridge function accessors
//
// These provide a safe way to call bridge functions. They read from globals
// at call time so that tests can install mocks via `global.$$createNode` etc.
// ---------------------------------------------------------------------------

exports.createNode = function createNode(
  type,
  surfaceId,
  props,
  isInsideTextContext,
  instanceHandle,
) {
  return $$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle);
};

exports.createTextNode = function createTextNode(text, surfaceId, instanceHandle) {
  return $$createTextNode(text, surfaceId, instanceHandle);
};

exports.cloneNode = function cloneNode(node) {
  return $$cloneNode(node);
};

exports.cloneNodeWithNewProps = function cloneNodeWithNewProps(node, newProps) {
  return $$cloneNodeWithNewProps(node, newProps);
};

exports.cloneNodeWithNewChildren = function cloneNodeWithNewChildren(node, children) {
  return $$cloneNodeWithNewChildren(node, children);
};

exports.cloneNodeWithNewChildrenAndProps = function cloneNodeWithNewChildrenAndProps(
  node,
  children,
  newProps,
) {
  return $$cloneNodeWithNewChildrenAndProps(node, children, newProps);
};

exports.appendChild = function appendChild(parentNode, childNode) {
  return $$appendChild(parentNode, childNode);
};

exports.createChildSet = function createChildSet() {
  return $$createChildSet();
};

exports.appendChildToChildSet = function appendChildToChildSet(childSet, child) {
  return $$appendChildToChildSet(childSet, child);
};

exports.completeRoot = function completeRoot(surfaceId, childNodes) {
  return $$completeRoot(surfaceId, childNodes);
};

exports.measureNode = function measureNode(node, callback) {
  return $$measureNode(node, callback);
};

exports.registerEventHandler = function registerEventHandler(handler) {
  return $$registerEventHandler(handler);
};

exports.fetch = function fetch(url, options, callback) {
  return $$fetch(url, options, callback);
};

// ---------------------------------------------------------------------------
// Event type constants
//
// Canonical event type strings used across the bridge. The native side
// dispatches events using these exact strings, and the renderer's event
// system matches on them.
// ---------------------------------------------------------------------------

exports.EventTypes = Object.freeze({
  CLICK: 'click',
  CHANGE: 'change',
  SCROLL: 'scroll',
  LAYOUT: 'layout',
});
