---
name: research-mounting-scheduling
description: Research C++ mounting pipeline from shadow tree commit to UIKit views.
---

# Research: Mounting, Scheduling & Layout Pipeline

## Objective

Research the pipeline from shadow tree commit to screen pixels: how the Differentiator computes mutations, how the MountingCoordinator delivers transactions, how the Scheduler orchestrates layout and commit, and how layout results flow to UIKit.

## Dependencies

Run `/research-cpp-shadow-tree` first — this research builds on the shadow tree design.

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/react/renderer/mounting/Differentiator.h` and `.cpp` — Tree diff algorithm
2. `packages/react-native/ReactCommon/react/renderer/mounting/ShadowViewMutation.h` — Mutation types (Create, Delete, Insert, Remove, Update)
3. `packages/react-native/ReactCommon/react/renderer/mounting/MountingCoordinator.h` — Transaction buffering
4. `packages/react-native/ReactCommon/react/renderer/mounting/MountingTransaction.h` — Commit artifacts
5. `packages/react-native/ReactCommon/react/renderer/scheduler/Scheduler.h` and `.cpp` — Surface/event coordination
6. `packages/react-native/ReactCommon/react/renderer/components/view/YogaLayoutableShadowNode.h` — Layout pipeline

## Instructions

1. Understand the Differentiator — how it computes mutations from old vs new shadow trees
2. For mutation-mode reconciler, determine if we even need tree diffing (reconciler tells us mutations directly)
3. Study MountingCoordinator transaction buffering — is it needed if JS runs on main thread?
4. Trace when Yoga layout is calculated (during commit phase or separate pass)
5. Understand how layout results (LayoutMetrics) translate to UIView frame updates
6. Design the simplest viable scheduling model for our use case

## Questions to Answer

1. For mutation-mode reconciler, do we need the Differentiator? Or can we apply mutations directly without diffing?
2. What does MountingCoordinator buy us? Is it needed if JS runs on main thread (no thread hop)?
3. When is `YGNodeCalculateLayout` called — during render, commit, or separate layout pass?
4. How do mounting mutations translate to UIKit calls? (ShadowViewMutation -> insertSubview, removeFromSuperview, property updates)
5. What is the simplest viable scheduling model if JS runs on main thread?
6. When and how are layout results applied to UIViews? CATransaction wrapping?

## Output

Write to: `docs/research/mounting-scheduling.md`

Include:
- Complete mutation-mode pipeline: reconciler commit -> shadow tree mutation -> layout -> UIKit update
- Decision: use Differentiator or direct mutation application
- Simplified Scheduler/MountingCoordinator design (or justification for eliminating them)
- Yoga layout trigger point and threading model
- UIKit mounting transaction implementation (CATransaction usage)
- Threading model: which operations run on which threads

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Mounting, scheduling & layout pipeline"
