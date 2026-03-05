# Plan 1a: Project Scaffolding

## Context

This is the first step in forking `chrome-devtools-mcp` (at `~/oss/chrome-devtools-mcp`) into `tools/devtools-mcp/` within the Falcon repo. The goal is to copy the source, create a clean `package.json` and `tsconfig.json`, and delete all files that are not needed for Falcon's use case.

**Prerequisites**: None (this is the first plan in the series).

## Goal

A clean `tools/devtools-mcp/` directory with:
- All source files copied from chrome-devtools-mcp
- A new `package.json` with only the dependencies Falcon needs (no Puppeteer, Lighthouse, Rollup, eslint, etc.)
- A `tsconfig.json` adapted for the fork
- All unnecessary files deleted (Puppeteer adapters, slim mode, telemetry, daemon, Chrome CLI entry points, Lighthouse)
- `npm install` succeeds
- `npx tsc --noEmit` runs (type errors from missing rewrites are expected and OK at this stage)

## Steps

### 1. Copy source directory

```bash
mkdir -p tools/devtools-mcp
cp -r ~/oss/chrome-devtools-mcp/src tools/devtools-mcp/src
```

### 2. Create `tools/devtools-mcp/package.json`

```json
{
  "name": "react-dom-native-devtools-mcp",
  "version": "0.1.0",
  "description": "MCP server for Falcon DevTools (forked from chrome-devtools-mcp)",
  "type": "module",
  "bin": "./build/src/index.js",
  "main": "./build/src/server.js",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "clean": "node -e \"require('fs').rmSync('build', {recursive: true, force: true})\""
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.27.1",
    "chrome-devtools-frontend": "1.0.1591204",
    "core-js": "3.48.0",
    "debug": "4.4.3",
    "ws": "^8.18.0",
    "yargs": "18.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/debug": "^4.1.12",
    "@types/node": "^25.0.0",
    "@types/ws": "^8.5.0",
    "@types/yargs": "^17.0.33",
    "typescript": "^5.9.2"
  },
  "engines": {
    "node": "^20.19.0 || ^22.12.0 || >=23"
  }
}
```

**Dependencies rationale:**

| Keep | Why |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `chrome-devtools-frontend` | TraceEngine for performance analysis |
| `core-js` | Polyfills required by chrome-devtools-frontend |
| `debug` | Logging (used by `logger.ts`) |
| `ws` | WebSocket client for CDP connection (replaces Puppeteer) |
| `yargs` | CLI argument parsing |
| `zod` | Schema validation for MCP tool definitions |

| Drop | Why |
|---|---|
| `puppeteer` / `puppeteer-core` / `@puppeteer/browsers` | Replaced by direct CDP over WebSocket |
| `lighthouse` | Not applicable to native iOS apps |
| `@google/genai` | Google AI integration, not needed |
| `rollup` / `@rollup/*` / `rollup-plugin-*` | Bundling not needed, we use `tsc` directly |
| `eslint` / `@eslint/*` / `@typescript-eslint/*` / `prettier` | Linting not needed in fork |
| `sinon` | Test mocking framework, not needed |
| `tiktoken` | Token counting for AI, not needed |
| `@stylistic/eslint-plugin` / `eslint-plugin-import` / `globals` | Linting plugins |
| `@types/sinon` / `@types/filesystem` | Types for dropped deps |

### 3. Create `tools/devtools-mcp/tsconfig.json`

Based on the upstream `tsconfig.json` but with test-related includes removed:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023", "DOM", "ES2024.Promise", "ESNext.Iterator", "ESNext.Collection"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "outDir": "./build",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "incremental": true,
    "allowJs": true,
    "useUnknownInCatchVariables": false
  },
  "include": [
    "src/**/*.ts",
    "node_modules/chrome-devtools-frontend/front_end/core/common",
    "node_modules/chrome-devtools-frontend/front_end/core/host",
    "node_modules/chrome-devtools-frontend/front_end/core/i18n",
    "node_modules/chrome-devtools-frontend/front_end/core/platform",
    "node_modules/chrome-devtools-frontend/front_end/core/protocol_client",
    "node_modules/chrome-devtools-frontend/front_end/core/root",
    "node_modules/chrome-devtools-frontend/front_end/core/sdk",
    "node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker",
    "node_modules/chrome-devtools-frontend/front_end/foundation/foundation.ts",
    "node_modules/chrome-devtools-frontend/front_end/foundation/Universe.ts",
    "node_modules/chrome-devtools-frontend/front_end/generated",
    "node_modules/chrome-devtools-frontend/front_end/legacy/legacy-defs.d.ts",
    "node_modules/chrome-devtools-frontend/front_end/models/annotations",
    "node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/NetworkRequestFormatter.ts",
    "node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceInsightFormatter.ts",
    "node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/PerformanceTraceFormatter.ts",
    "node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/data_formatters/UnitFormatters.ts",
    "node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/performance",
    "node_modules/chrome-devtools-frontend/front_end/models/greendev",
    "node_modules/chrome-devtools-frontend/front_end/models/bindings",
    "node_modules/chrome-devtools-frontend/front_end/models/cpu_profile",
    "node_modules/chrome-devtools-frontend/front_end/models/crux-manager",
    "node_modules/chrome-devtools-frontend/front_end/models/emulation",
    "node_modules/chrome-devtools-frontend/front_end/models/formatter",
    "node_modules/chrome-devtools-frontend/front_end/models/geometry",
    "node_modules/chrome-devtools-frontend/front_end/models/issues_manager",
    "node_modules/chrome-devtools-frontend/front_end/models/logs",
    "node_modules/chrome-devtools-frontend/front_end/models/network_time_calculator",
    "node_modules/chrome-devtools-frontend/front_end/models/source_map_scopes",
    "node_modules/chrome-devtools-frontend/front_end/models/stack_trace",
    "node_modules/chrome-devtools-frontend/front_end/models/text_utils",
    "node_modules/chrome-devtools-frontend/front_end/models/trace_source_maps_resolver",
    "node_modules/chrome-devtools-frontend/front_end/models/trace",
    "node_modules/chrome-devtools-frontend/front_end/models/workspace",
    "node_modules/chrome-devtools-frontend/front_end/panels/issues/IssueAggregator.ts",
    "node_modules/chrome-devtools-frontend/front_end/third_party/acorn",
    "node_modules/chrome-devtools-frontend/front_end/third_party/codemirror",
    "node_modules/chrome-devtools-frontend/front_end/third_party/i18n",
    "node_modules/chrome-devtools-frontend/front_end/third_party/intl-messageformat",
    "node_modules/chrome-devtools-frontend/front_end/third_party/legacy-javascript",
    "node_modules/chrome-devtools-frontend/front_end/third_party/marked",
    "node_modules/chrome-devtools-frontend/front_end/third_party/source-map-scopes-codec",
    "node_modules/chrome-devtools-frontend/front_end/third_party/third-party-web",
    "node_modules/chrome-devtools-frontend/mcp"
  ],
  "exclude": ["node_modules/chrome-devtools-frontend/**/*.test.ts"],
  "files": [
    "node_modules/chrome-devtools-frontend/front_end/third_party/acorn/package/dist/acorn.mjs"
  ]
}
```

### 4. Delete unnecessary files

Delete these files/directories from `tools/devtools-mcp/src/`:

| File/Directory | Reason |
|---|---|
| `src/DevToolsConnectionAdapter.ts` | Puppeteer-to-DevTools CDP bridge |
| `src/DevtoolsUtils.ts` | Universe/target management for Chrome DevTools windows |
| `src/PageCollector.ts` | Puppeteer-based network/console collectors |
| `src/WaitForHelper.ts` | Puppeteer-based event waiting |
| `src/SlimMcpResponse.ts` | Slim mode response formatting |
| `src/polyfill.ts` | Browser polyfills (not needed for Node.js) |
| `src/issue-descriptions.ts` | DevTools issue descriptions |
| `src/telemetry/` | Clearcut analytics (entire directory) |
| `src/daemon/` | Daemon mode (entire directory) |
| `src/bin/` | Chrome-specific CLI entry points (`chrome-devtools.ts`, `cliDefinitions.ts`) |
| `src/tools/slim/` | Slim mode tools (entire directory) |
| `src/third_party/lighthouse-devtools-mcp-bundle.js` | Lighthouse bundle |
| `src/third_party/LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES` | Lighthouse license notices |
| `src/third_party/devtools-formatter-worker.ts` | DevTools formatter worker |
| `src/formatters/IssueFormatter.ts` | DevTools issues formatting (not applicable) |
| `src/formatters/NetworkFormatter.ts` | Network formatting (network tools will be stubbed) |
| `src/utils/ExtensionRegistry.ts` | Chrome extension management |

```bash
cd tools/devtools-mcp
rm -f src/DevToolsConnectionAdapter.ts
rm -f src/DevtoolsUtils.ts
rm -f src/PageCollector.ts
rm -f src/WaitForHelper.ts
rm -f src/SlimMcpResponse.ts
rm -f src/polyfill.ts
rm -f src/issue-descriptions.ts
rm -rf src/telemetry
rm -rf src/daemon
rm -rf src/bin
rm -rf src/tools/slim
rm -f src/third_party/lighthouse-devtools-mcp-bundle.js
rm -f src/third_party/LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES
rm -f src/third_party/devtools-formatter-worker.ts
rm -f src/formatters/IssueFormatter.ts
rm -f src/formatters/NetworkFormatter.ts
rm -f src/utils/ExtensionRegistry.ts
```

### 5. Keep these files unchanged (they have no Puppeteer deps)

| File | Purpose |
|---|---|
| `src/logger.ts` | Debug-based logger |
| `src/Mutex.ts` | FIFO mutex for serializing tool calls |
| `src/devtools.d.ts` | TypeScript declarations for DevTools frontend |
| `src/tools/categories.ts` | Tool category enum |
| `src/utils/pagination.ts` | Pagination helper |
| `src/utils/string.ts` | String utilities |
| `src/utils/types.ts` | Shared utility types |

### 6. Keep for Plan 2 (no changes needed now)

| File | Purpose |
|---|---|
| `src/formatters/ConsoleFormatter.ts` | Console message formatting |
| `src/formatters/SnapshotFormatter.ts` | Snapshot formatting |
| `src/utils/keyboard.ts` | Keyboard input parsing |

### 7. Update `src/version.ts`

Change the version string to `'0.1.0'`.

### 8. Install dependencies (HUMAN CHECKPOINT)

**This step requires internet access and must be run by the user, not the agent.**

The agent should complete steps 1-7 and 9-10, then stop and ask the user to run:

```bash
cd tools/devtools-mcp && npm install
```

All subsequent plans (1B, 1C, 1D, 2A-2D, 3) assume `node_modules/` is already populated. No plan after this point should run `npm install` or any command that requires internet access.

**Also install the MCP Inspector** (needed for Plan 1D manual testing):

```bash
npm install -g @modelcontextprotocol/inspector
```

### 9. Add `.gitignore` entries

Add the following to the project root `.gitignore` (or create `tools/devtools-mcp/.gitignore`):

```
tools/devtools-mcp/build/
tools/devtools-mcp/node_modules/
```

**Note**: This package is a standalone package (not an npm workspace member). It has its own `package.json` and `node_modules/`, independent of the root `package.json`. It follows the pattern of `tools/fantom/` which is also standalone.

### 10. Verify TypeScript can parse the project

```bash
cd tools/devtools-mcp && npx tsc --noEmit
```

Type errors are expected at this stage because files like `McpContext.ts`, `McpPage.ts`, `server.ts`, `third_party/index.ts`, etc. still reference Puppeteer types and deleted modules. Those will be fixed in Plans 1b-1d.

## Files Modified

| File | Action |
|---|---|
| `tools/devtools-mcp/package.json` | Create new |
| `tools/devtools-mcp/tsconfig.json` | Create new |
| `tools/devtools-mcp/src/version.ts` | Edit (set to `'0.1.0'`) |
| `tools/devtools-mcp/src/DevToolsConnectionAdapter.ts` | Delete |
| `tools/devtools-mcp/src/DevtoolsUtils.ts` | Delete |
| `tools/devtools-mcp/src/PageCollector.ts` | Delete |
| `tools/devtools-mcp/src/WaitForHelper.ts` | Delete |
| `tools/devtools-mcp/src/SlimMcpResponse.ts` | Delete |
| `tools/devtools-mcp/src/polyfill.ts` | Delete |
| `tools/devtools-mcp/src/issue-descriptions.ts` | Delete |
| `tools/devtools-mcp/src/telemetry/` | Delete (entire directory) |
| `tools/devtools-mcp/src/daemon/` | Delete (entire directory) |
| `tools/devtools-mcp/src/bin/` | Delete (entire directory) |
| `tools/devtools-mcp/src/tools/slim/` | Delete (entire directory) |
| `tools/devtools-mcp/src/third_party/lighthouse-devtools-mcp-bundle.js` | Delete |
| `tools/devtools-mcp/src/third_party/LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES` | Delete |
| `tools/devtools-mcp/src/third_party/devtools-formatter-worker.ts` | Delete |
| `tools/devtools-mcp/src/formatters/IssueFormatter.ts` | Delete |
| `tools/devtools-mcp/src/formatters/NetworkFormatter.ts` | Delete |
| `tools/devtools-mcp/src/utils/ExtensionRegistry.ts` | Delete |
| `.gitignore` (root or `tools/devtools-mcp/.gitignore`) | Add `build/` and `node_modules/` entries |

## Testing & Verification

### Automated Tests

1. **Verify `npm install` succeeds** (run by user, not agent):
   ```bash
   cd tools/devtools-mcp && npm install
   # Exit code must be 0
   ```

2. **Verify no Puppeteer in dependency tree** (agent can verify after user installs):
   ```bash
   cd tools/devtools-mcp && ! grep -q puppeteer package.json
   cd tools/devtools-mcp && ! grep -q lighthouse package.json
   cd tools/devtools-mcp && ! grep -q '@puppeteer/browsers' package.json
   # All three must exit 0 (no matches)
   ```

3. **Verify deleted files are gone:**
   ```bash
   cd tools/devtools-mcp
   test ! -f src/DevToolsConnectionAdapter.ts
   test ! -f src/DevtoolsUtils.ts
   test ! -f src/PageCollector.ts
   test ! -f src/WaitForHelper.ts
   test ! -f src/SlimMcpResponse.ts
   test ! -f src/polyfill.ts
   test ! -f src/issue-descriptions.ts
   test ! -d src/telemetry
   test ! -d src/daemon
   test ! -d src/bin
   test ! -d src/tools/slim
   test ! -f src/third_party/lighthouse-devtools-mcp-bundle.js
   test ! -f src/third_party/devtools-formatter-worker.ts
   test ! -f src/formatters/IssueFormatter.ts
   test ! -f src/formatters/NetworkFormatter.ts
   test ! -f src/utils/ExtensionRegistry.ts
   ```

4. **Verify kept files exist:**
   ```bash
   cd tools/devtools-mcp
   test -f src/logger.ts
   test -f src/Mutex.ts
   test -f src/devtools.d.ts
   test -f src/tools/categories.ts
   test -f src/utils/pagination.ts
   test -f src/utils/string.ts
   test -f src/utils/types.ts
   test -f src/trace-processing/parse.ts
   test -f src/tools/performance.ts
   test -f src/McpContext.ts
   test -f src/McpPage.ts
   test -f src/server.ts
   test -f src/third_party/index.ts
   ```

5. **Verify `tsc` can parse (may have errors, that's OK):**
   ```bash
   cd tools/devtools-mcp && npx tsc --noEmit 2>&1 | head -5
   # Should run without crashing (type errors from missing rewrites are expected)
   ```

### Manual Tests

1. Open `tools/devtools-mcp/package.json` and verify it has `ws` as a dependency and no Puppeteer-related entries
2. Open `tools/devtools-mcp/src/version.ts` and verify it says `'0.1.0'`
3. Verify directory structure looks clean: `ls -la tools/devtools-mcp/src/`

### Regression Checks

- Run `npm test` from the Falcon root to ensure existing tests pass (this plan only adds files, no existing code is modified)
- Verify `tools/devtools-mcp/` does not interfere with the main Falcon build

### Acceptance Criteria

- [ ] `tools/devtools-mcp/` directory exists with source files
- [ ] `package.json` has no Puppeteer, Lighthouse, Rollup, or eslint dependencies
- [ ] `package.json` includes `ws`, `chrome-devtools-frontend`, `@modelcontextprotocol/sdk`, `core-js`, `debug`, `yargs`, `zod`
- [ ] `tsconfig.json` includes `chrome-devtools-frontend` paths
- [ ] All 16+ files/directories from the "Delete" table are removed
- [ ] All 7 files from the "Keep unchanged" table exist
- [ ] `npm install` exits successfully (run by user — agent cannot do this)
- [ ] `npx tsc --noEmit` runs (errors from Puppeteer references in remaining files are OK)
- [ ] `src/version.ts` contains `'0.1.0'`
- [ ] `.gitignore` excludes `tools/devtools-mcp/build/` and `tools/devtools-mcp/node_modules/`
- [ ] `@modelcontextprotocol/inspector` installed globally (for Plan 1D testing)

## Dependencies

None — this is the first plan in the series.
