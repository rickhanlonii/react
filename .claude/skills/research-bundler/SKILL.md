---
name: research-bundler
description: Research JS bundler options for building the native client bundle. Run this to compare esbuild, swc, metro, and others.
---

# Research: JS Bundler

## Objective

Compare JavaScript bundler options for building the JS bundle that runs in the native iOS client. Recommend one based on our requirements.

## Instructions

1. Research bundler options:
   - **esbuild** — Fast Go-based bundler, simple config
   - **swc** — Rust-based, drop-in Babel replacement
   - **Metro** — React Native's bundler, built for RN use case
   - **Rollup** — Mature, good for libraries
   - **Webpack** — Most features, complex config

2. Evaluate against our requirements:
   - Must bundle ESM and CommonJS modules
   - Must handle React and JSX
   - Must output a single bundle file for embedding in iOS app
   - Must support watch mode for development
   - Fast rebuild times (developer experience)
   - Simple configuration (we're not a complex web app)

3. Consider Flight client implications:
   - react-server-dom-* packages may have specific bundler requirements
   - Client references need to be resolvable

4. Research how React Native uses Metro and whether it's applicable outside RN

## Output

Write to: `docs/research/bundler.md`

Format:
- Comparison table: Bundler | Speed | Config Complexity | RN Compatibility | Flight Support
- Pros/cons for each in our use case
- Clear recommendation with rationale
- Example minimal config for recommended bundler

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS bundler comparison"
