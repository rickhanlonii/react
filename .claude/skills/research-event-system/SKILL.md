---
name: research-event-system
description: Research native event system with fixed DOM event set and synchronous discrete dispatch.
---

# Research: Native Event System

## Objective

Design the event system: discrete events (click, press) dispatch synchronously on the main thread; continuous events (scroll, touch move) batch asynchronously; the event set is fixed and matches DOM conventions (onClick, onChange, onScroll, etc.); no ViewConfig-based event registration.

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/react/renderer/core/EventDispatcher.h` and `.cpp` — Event dispatch infrastructure
2. `packages/react-native/ReactCommon/react/renderer/core/RawEvent.h` — Event categories (Discrete, Continuous, etc.)
3. `packages/react-native/ReactCommon/react/renderer/components/view/TouchEventEmitter.h` — Built-in event methods pattern
4. `packages/react-native/ReactCommon/react/renderer/core/EventEmitter.h` and `.cpp` — Base event emitter
5. `packages/react-native/ReactCommon/react/renderer/runtimescheduler/RuntimeScheduler.h` — `executeNowOnTheSameThread` for sync dispatch
6. `packages/react-native/ReactCommon/react/renderer/uimanager/UIManagerBinding.cpp` — `dispatchEvent` / `dispatchEventToJS`

Also read in `../react/`:

7. `packages/react-reconciler/src/ReactEventPriorities.js` — React priority levels
8. `packages/react-native-renderer/src/ReactFiberConfigFabric.js` — `resolveUpdatePriority` implementation

## Instructions

1. Study Fabric's event category system (RawEvent::Category) and how it maps to React priorities
2. Understand how synchronous dispatch works via RuntimeScheduler
3. Analyze TouchEventEmitter as a pattern for built-in event methods
4. Trace event flow: UIKit gesture -> C++ EventEmitter -> EventDispatcher -> JS handler
5. Define the complete fixed event set for react-dom-native (DOM-like events)
6. Design event batching/coalescing for continuous events

## Questions to Answer

1. What is the complete fixed event set? List every event with DOM name, category, and supported elements
2. How does synchronous discrete dispatch work mechanically? What does "synchronous on main thread" mean when JS runs on main thread too?
3. How do continuous events get batched? What is the coalescing strategy?
4. How should the C++ EventEmitter subclass look? One class for all elements or per-element?
5. How does event bubbling work? Does React handle it, or must native walk up the tree?
6. How does `resolveUpdatePriority()` in JS host config know current event priority?
7. Without ViewConfig's event type maps, how does the reconciler know which events bubble?

## Output

Write to: `docs/research/event-system.md`

Include:
- Complete fixed event table (event name, DOM name, elements, category, RawEvent::Category mapping)
- Synchronous discrete dispatch architecture (main thread flow)
- Continuous event batching/coalescing strategy
- C++ EventEmitter class design
- JS-side event handler registration (how onClick prop flows to C++ and back)
- Priority mapping: native category -> React EventPriority
- Event payload shapes for each event type

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Native event system"
