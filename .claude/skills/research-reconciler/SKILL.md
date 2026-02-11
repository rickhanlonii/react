---
name: research-reconciler
description: Research the React reconciler host config API. Run this to document every function a custom renderer must implement.
---

# Research: React Reconciler Host Config

## Objective

Document the complete react-reconciler host config interface — every function, its signature, purpose, and whether it's required or optional. Focus on **mutation mode** (not persistent mode).

## Input Files

Read these files in `../react/` (relative to project root):

1. `packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` — The definitive list of host config functions (287 lines). Every `export` is a function the renderer must provide.
2. `packages/react-noop-renderer/src/createReactNoop.js` — The simplest working renderer. Shows how each host config function is implemented with minimal logic.
3. `packages/react-reconciler/src/forks/ReactFiberConfig.native.js` — React Native's host config fork (shows real-world implementation mapping).

## Instructions

1. Read `ReactFiberConfig.custom.js` and list every exported function
2. For each function, read `createReactNoop.js` to find its implementation
3. Categorize functions by lifecycle phase:
   - **Instance creation**: `createInstance`, `createTextInstance`, etc.
   - **Mutation**: `appendChild`, `removeChild`, `commitUpdate`, etc.
   - **Scheduling**: `scheduleMicrotask`, `getCurrentEventPriority`, etc.
   - **Hydration**: (note these but mark as "not needed" — we don't hydrate)
   - **Other**: context, resources, singletons, etc.
4. Note which functions can use noop's stub implementation vs. which need real logic
5. Pay special attention to `commitUpdate` — this is where prop diffs drive native view updates

## Output

Write to: `docs/research/reconciler.md`

Format:
- Table: Function | Category | Required | Noop Implementation | Notes
- Section per category with explanation of the lifecycle phase
- Summary: which functions need real implementation for react-dom-native vs. which can use stubs

## After Completion

Update `docs/MASTER_PLAN.md` — check off "React reconciler host config API"
