---
name: research-js-engine
description: Research JS engine options for the native client. Run this to compare Hermes vs JavaScriptCore for RSC client needs.
---

# Research: JS Engine Comparison

## Objective

Compare Hermes and JavaScriptCore (JSC) as the JavaScript engine for the native iOS client. Recommend one based on RSC client requirements.

## Instructions

1. Research Hermes on iOS:
   - Bytecode precompilation benefits
   - iOS integration story (build from source vs. prebuilt)
   - ES module support status
   - Streaming/async capabilities
   - JSI (JavaScript Interface) for native bridge
   - Bundle size

2. Research JavaScriptCore on iOS:
   - Built into iOS (no additional bundle size)
   - JSC C API availability
   - Performance characteristics
   - ES module support
   - `JavaScriptCore.framework` API surface (JSContext, JSValue, JSExport)

3. Evaluate against RSC client requirements:
   - Must deserialize Flight stream (streaming JSON parsing)
   - Must resolve client references (module loading)
   - Must call into native (create/update/delete views)
   - Must handle React rendering (reconciler runs in JS)
   - Startup time matters (perceived app launch speed)

4. Research how React Native currently handles this on iOS

## Output

Write to: `docs/research/js-engine.md`

Format:
- Comparison table: Feature | Hermes | JSC
- Pros/cons for each in our use case
- Clear recommendation with rationale
- Integration steps for the recommended engine
- Risk assessment for the other option (in case we need to switch)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS engine comparison"
