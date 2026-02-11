# ADR 003: Module Resolution — Pre-Bundled Registry

## Status

Accepted

## Context

The Flight client receives `I` (Import) rows from the Next.js server containing client component references. These references use webpack/turbopack module IDs that the client must resolve to actual component modules. Options:

1. **Webpack-style**: Implement `__webpack_require__` and chunk loading in native. Requires webpack runtime.
2. **ESM-style**: Use `import(specifier)` for dynamic module loading. Requires ESM support in the JS engine.
3. **Pre-bundled registry**: Bundle all client components into the single runtime bundle. Map module IDs to pre-registered exports via a simple lookup table.

## Decision

**Use a pre-bundled module registry** (option 3), matching the noop renderer's approach.

## Rationale

### Simplest possible approach

All client components are known at build time and bundled into the single runtime JS bundle by esbuild. No dynamic loading, no chunk fetching, no module system emulation.

### How it works

1. **Build time**: esbuild bundles all client component source files into `build/client.js`
2. **Runtime registration**: Each client component registers itself in a global module map keyed by its module ID
3. **Flight client config**: `resolveClientReference(config, metadata)` looks up the module ID in the registry. `preloadModule()` is a no-op (already loaded). `requireModule()` returns the registered export.

### Server-side module ID mapping

The Next.js server emits client references with webpack module IDs (e.g., `"(app-pages-browser)/./components/Button.tsx"`). We need a manifest that maps these IDs to our registered modules:

```js
// Generated at build time or maintained manually
const CLIENT_MODULE_MAP = {
  "(app-pages-browser)/./components/Button.tsx": {
    module: require('./components/Button'),
    exportName: 'default',
  },
  // ...
};
```

### Flight client config implementation

```js
resolveClientReference(config, metadata) {
  const moduleId = metadata[0];   // webpack module ID string
  const exportName = metadata[2]; // named export
  const entry = config.modules[moduleId];
  if (!entry) {
    throw new Error(`Unknown client module: ${moduleId}`);
  }
  return { module: entry.module, name: exportName };
},

preloadModule(ref) {
  return null; // Already loaded — everything is in the bundle
},

requireModule(ref) {
  const mod = ref.module;
  if (ref.name === 'default' || ref.name === '') {
    return mod.default || mod;
  }
  return mod[ref.name];
},
```

## Consequences

- All client components must be known at build time and included in the bundle
- No code splitting or lazy loading of client components (acceptable for initial implementation)
- The module map must be kept in sync with the Next.js server's client reference IDs
- Bundle size grows with the number of client components (mitigated by tree-shaking)

## Future: Dynamic Loading

If we later need code splitting:
1. `resolveClientReference` returns a URL-based reference
2. `preloadModule` fetches the chunk via URLSession and evaluates it
3. `requireModule` reads from a module cache populated by the fetch
4. This requires JSC's `evaluateScript` for loading additional code at runtime
