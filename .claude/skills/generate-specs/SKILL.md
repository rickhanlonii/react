---
name: generate-specs
description: Generate architecture specs from research output. Run this after all 7 research skills are complete.
---

# Generate Specifications

## Objective

Read all research documents, make architecture decisions, and produce implementation specifications for each package.

## Prerequisites

All 7 research documents must exist in `docs/research/`:
- `reconciler.md`, `flight-protocol.md`, `nextjs-flight.md`, `yoga-ios.md`, `js-engine.md`, `html-mapping.md`, `ios-uikit.md`

## Instructions

1. Read all 7 research documents
2. Make architecture decisions and write ADRs:
   - JS engine choice (based on `js-engine.md` recommendation)
   - Bridge approach: JSI vs JSC C API vs JavaScriptCore.framework
   - Module resolution strategy for Flight client references
   - Component registration pattern (static vs dynamic)
3. Write specs for each package (see Output section)
4. Each spec should include: API surface, data structures, function signatures, error handling, and integration points with other packages

## Output

Write the following files:

- `docs/specs/adr/001-js-engine.md` — JS engine decision
- `docs/specs/adr/002-bridge-approach.md` — Native bridge decision
- `docs/specs/adr/003-module-resolution.md` — Flight client reference resolution
- `docs/specs/adr/004-component-registration.md` — Component registry pattern
- `docs/specs/renderer-host-config.md` — Full host config spec with function implementations
- `docs/specs/html-element-registry.md` — Element registry API, component definitions
- `docs/specs/yoga-defaults.md` — Yoga default config per element
- `docs/specs/flight-client.md` — Flight client architecture, streaming, deserialization
- `docs/specs/bridge-protocol.md` — JS ↔ native message protocol

## After Completion

Update `docs/MASTER_PLAN.md` — check off all Phase 2 items
