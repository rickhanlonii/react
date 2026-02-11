# Research: JS Bundler for Native Client

## Context

We need a JavaScript bundler to produce a single `.js` bundle that runs inside the native iOS client. This bundle contains the React reconciler, Flight client, component mappings, and bridge code. It does NOT bundle the user's application code (that comes from the Next.js RSC server as a Flight stream). The bundler's job is to package our client-side framework runtime into a single file that can be embedded in the iOS app and loaded by the JS engine (Hermes or JSC).

## Requirements

| Requirement | Priority | Notes |
|---|---|---|
| Single output bundle | Must | Embedded in iOS app binary |
| ESM + CJS module support | Must | React packages use both formats |
| JSX/React transform | Must | Our renderer code uses JSX |
| Watch mode | Must | Fast iteration during development |
| Fast rebuild times | High | DX during development |
| Simple configuration | High | We are not a complex web app; minimal surface area |
| Source maps | High | Debugging in native context |
| Tree shaking | Nice | Reduce bundle size for mobile |
| TypeScript support | Nice | May want TS in future |
| Flight client compatibility | Must | See analysis below |

## Flight Client Implications

The Flight client (`react-client/flight`) needs a "bundler config" that tells it how to resolve client references received from the server. Looking at React's source, there are several Flight bundler integrations:

- **`react-server-dom-webpack`** — Uses webpack module IDs and chunk loading via `__webpack_require__`
- **`react-server-dom-turbopack`** — Uses Turbopack chunk loading
- **`react-server-dom-parcel`** — Uses Parcel's module system
- **`react-server-dom-esm`** — Uses native ESM `import()` with file path-based module resolution
- **`react-server-dom-unbundled`** — Uses Node.js `import()` for unbundled module loading
- **Noop renderer** — Simplest: in-memory module registry with `readModule(idx)`

### Key insight: Our use case is unique

Our Flight client runs on native iOS, not in a browser or Node.js. The server (Next.js) produces the Flight stream, and our native client consumes it. For client component references in the Flight stream, we have three options:

1. **Noop-style (recommended)**: Since we control both the server output format and the native client, we can use a simple module registry approach like the noop renderer. Client references map to pre-registered component factories. No dynamic `import()` or chunk loading needed because all client components are bundled into the single runtime bundle.

2. **ESM-style**: The ESM Flight client uses `import(specifier)` to dynamically load client modules. This could work if the JS engine supports dynamic `import()`, but adds complexity for no benefit since we want a single bundle.

3. **Webpack-style**: Would require implementing `__webpack_require__` and chunk loading in the native environment. Overkill.

**Conclusion**: The bundler choice does NOT need to match the Flight bundler integration. We will implement a custom Flight client config (like noop) with a simple module registry. The bundler just needs to produce one output file containing all our runtime code.

## Bundler Comparison

### Comparison Table

| Feature | esbuild | SWC (swcpack) | Metro | Rollup | Webpack |
|---|---|---|---|---|---|
| **Speed** | Excellent (Go) | Excellent (Rust) | Good | Moderate | Slow |
| **Config complexity** | Minimal | Minimal | Moderate (RN-specific) | Moderate | High |
| **ESM + CJS** | Yes | Yes | Yes (CJS focus) | Yes (ESM focus) | Yes |
| **JSX transform** | Built-in | Built-in | Via Babel | Via plugin | Via Babel |
| **Watch mode** | Built-in | Limited | Built-in (HMR) | Via plugin | Built-in |
| **Single bundle output** | Yes | Yes | Yes | Yes | Yes |
| **Source maps** | Yes | Yes | Yes | Yes | Yes |
| **Tree shaking** | Yes | Limited | No | Excellent | Yes |
| **Maturity** | High | Medium (bundler is newer) | High (for RN) | High | Very High |
| **RN compatibility** | N/A | N/A | Native | N/A | N/A |
| **Config lines (est.)** | ~10 | ~15 | ~30+ | ~20 | ~50+ |
| **npm install size** | ~9 MB | ~40 MB | ~100+ MB (with deps) | ~5 MB | ~50+ MB |

### esbuild

**Pros**:
- Extremely fast builds (10-100x faster than webpack)
- Minimal configuration — a single `esbuild.build()` call handles everything
- Built-in JSX transform (automatic or classic)
- Built-in watch mode with rebuild callbacks
- Native ESM and CJS support with format conversion
- Built-in source map support
- Tree shaking out of the box
- Single binary, no dependencies — just `npm install esbuild`
- Can define `__DEV__` and `process.env.NODE_ENV` replacements trivially
- Handles `react-reconciler` and React packages without issues
- Plugin API available for custom transforms if needed

**Cons**:
- No HMR protocol built-in (we'd implement our own via bridge anyway)
- Less ecosystem of plugins compared to webpack (not needed for our case)
- Not the standard choice for React Native projects (irrelevant — we are not React Native)

### SWC (swcpack / `@swc/core`)

**Pros**:
- Very fast (Rust-based)
- Drop-in Babel replacement for transforms
- Good JSX support
- Used by Next.js internally

**Cons**:
- The bundler (`swcpack`) is less mature than the compiler
- swcpack is still considered experimental and not production-ready for standalone use
- Configuration is more complex than esbuild for bundling
- When used as a bundler (not just a compiler), the API is less stable
- Better suited as a transform layer inside another bundler than as a standalone bundler

### Metro

**Pros**:
- Battle-tested with React Native
- Deep integration with React Native's module system
- HMR support designed for native apps
- Hermes bytecode compilation support

**Cons**:
- Tightly coupled to React Native — expects RN module resolution, polyfills, and project structure
- Brings in many RN-specific dependencies and assumptions
- Configuration assumes `react-native` is installed and configured
- Uses CommonJS module format internally (not ESM)
- The module resolution algorithm is RN-specific (platform extensions like `.ios.js`, Haste modules)
- We are NOT React Native — we use React directly with a custom renderer; Metro's RN assumptions would fight us
- Would require significant hacking to work outside the RN ecosystem
- No benefit over simpler bundlers since we don't use RN's component system

### Rollup

**Pros**:
- Excellent tree shaking (ESM-first design)
- Clean output code
- Good for libraries and single-bundle outputs
- Mature plugin ecosystem

**Cons**:
- Slower than esbuild (JS-based)
- Watch mode requires `rollup-plugin-watch` or external tooling
- CommonJS support requires `@rollup/plugin-commonjs` (extra config)
- JSX requires `@rollup/plugin-babel` or similar (extra config)
- More configuration needed compared to esbuild
- Rebuild times are noticeably slower in watch mode

### Webpack

**Pros**:
- Most mature and feature-rich
- Massive plugin ecosystem
- HMR support
- React's Flight fixture (`fixtures/flight/`) uses webpack
- `react-server-dom-webpack` is the most complete Flight integration

**Cons**:
- Slowest build times of all options
- Most complex configuration (50+ lines minimum for our use case)
- Heavy dependency tree
- Overkill for bundling a single runtime bundle
- The fact that `react-server-dom-webpack` exists is irrelevant — we implement a custom Flight client config, not webpack's
- Configuration complexity is a maintenance burden for our small team

## Recommendation: esbuild

**esbuild is the clear winner for our use case.** Here is why:

1. **Simplest possible configuration** — Our requirements (bundle React reconciler + custom code into one file) map perfectly to esbuild's defaults. No plugins needed.

2. **Fastest builds** — In watch mode during development, esbuild rebuilds are typically under 50ms. This is critical for native development where the feedback loop already includes a bridge reload step.

3. **Flight compatibility is a non-issue** — Since we implement our own Flight client config (like noop), the bundler does not need any special Flight integration. esbuild just bundles our code.

4. **React/JSX works out of the box** — esbuild's built-in JSX transform handles `react/jsx-runtime` (automatic) or `React.createElement` (classic) with zero plugins.

5. **Single dependency** — `npm install esbuild` adds ~9 MB and zero transitive dependencies. Compare to webpack (~50 MB + plugins) or Metro (~100 MB + RN deps).

6. **Why not Metro?** — Metro is designed for React Native apps. We are building a custom React renderer, not a React Native app. Metro's assumptions about module resolution, polyfills, and project structure would create friction rather than help. We gain nothing from Metro's RN integration since we don't use RN's component system.

## Example Minimal Config

```js
// scripts/build.js
const esbuild = require('esbuild');

const shared = {
  entryPoints: ['packages/entry/index.js'],
  bundle: true,
  format: 'iife', // Single self-executing bundle for embedding in native app
  target: ['es2020'], // Modern JS — Hermes/JSC support
  jsx: 'automatic', // Uses react/jsx-runtime
  jsxImportSource: 'react',
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  sourcemap: true,
  outfile: 'build/client.js',
};

async function build() {
  await esbuild.build(shared);
  console.log('Build complete');
}

async function watch() {
  const ctx = await esbuild.context({
    ...shared,
    define: {
      ...shared.define,
      __DEV__: 'true',
      'process.env.NODE_ENV': '"development"',
    },
  });
  await ctx.watch();
  console.log('Watching for changes...');
}

const isWatch = process.argv.includes('--watch');
if (isWatch) {
  watch();
} else {
  build();
}
```

### Production build variant

```js
// scripts/build-prod.js
await esbuild.build({
  ...shared,
  define: {
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
  },
  minify: true,
  sourcemap: false, // Or 'external' for crash symbolication
  outfile: 'build/client.min.js',
});
```

### What the entry point looks like

```js
// packages/entry/index.js
import { createReconciler } from '../renderer';
import { registerComponents } from '../components';
import { initBridge } from '../bridge';
import { createFlightClient } from '../flight-client';

// Register all HTML element -> native view mappings
registerComponents();

// Initialize JS <-> Swift bridge
const bridge = initBridge();

// Create the Flight client for consuming RSC streams
const flightClient = createFlightClient();

// Create the React reconciler instance
const reconciler = createReconciler(bridge);

// Export the render function that the bridge calls when a Flight stream arrives
globalThis.__REACT_DOM_NATIVE__ = {
  render: (stream) => {
    const root = reconciler.createRoot();
    const tree = flightClient.createFromStream(stream);
    root.render(tree);
  },
};
```

## Metro: When Would It Make Sense?

Metro would be the right choice if:
- We were building ON TOP of React Native (using RN's component system)
- We needed Hermes bytecode compilation at build time (esbuild can output JS that Hermes compiles at load time, or we can add a post-build step)
- We needed RN's module resolution (platform extensions, Haste)
- We wanted to reuse the entire RN development infrastructure

None of these apply. We are building a custom renderer that replaces React Native's rendering pipeline while keeping the HTML element API. Metro would add complexity without benefits.

## Open Questions

1. **Hermes bytecode**: If we choose Hermes as the JS engine, we may want to pre-compile the bundle to Hermes bytecode (`.hbc`). This is a post-build step (`hermesc`) independent of the bundler choice. esbuild produces clean JS that Hermes can compile.

2. **Source maps in native**: Source map support in the JS engine debugger needs investigation. esbuild generates standard v3 source maps that should work with Safari's Web Inspector (for JSC) or Hermes debugger (for Hermes via Chrome DevTools protocol).

3. **Hot reload**: esbuild's watch mode detects changes, but we need our own bridge mechanism to signal the native app to reload the bundle. This is a bridge concern, not a bundler concern.
