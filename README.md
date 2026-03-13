# Falcon

A React framework that renders HTML elements (`<div>`, `<span>`, `<p>`, etc.) as native iOS views (UIKit) via Yoga layout.

Write your UI with familiar web elements and CSS-like styles, render it natively on iOS with full React Server Components support — Flight streaming, SSR, hydration, and Suspense.

## Architecture

- **Renderer** — Custom React reconciler (mutation mode) using `react-reconciler`, calling into a Swift shadow tree via JavaScriptCore
- **Shadow Tree** — Swift shadow nodes with Yoga layout, inspired by Fabric but simplified for fixed HTML elements
- **Layout** — Yoga with web-like defaults (`<div>` = column/block, `<span>` = virtual text with no UIView)
- **Server** — Express server handling RSC rendering via the Flight wire protocol with streaming
- **Client** — Native iOS app receives the Flight stream, deserializes with `react-client/flight`, feeds the custom renderer
- **JS Engine** — JavaScriptCore (native Swift API, zero bundle size)
- **Bundler** — esbuild

For the full architecture doc, see [docs/architecture.md](docs/architecture.md).

## Project Structure

```
packages/
  react-dom-native/     The library (JS renderer + Swift package)
  devtools-mcp/         Chrome DevTools MCP server for debugging
  fantom/               Headless test runner (JS + Swift)
fixtures/
  example/              Full RSC demo app (Flight + SSR + hydration)
  layout/               E2E layout comparison app and fixtures
  web-example/          Next.js web reference app for visual comparison
tests/
  integration/          Fantom integration tests (JS ↔ Swift)
scripts/                Build, test, and dev scripts
docs/                   Architecture, specs, research, plans
```

## Prerequisites

- macOS
- Xcode (latest stable)
- Node.js 20+
- An iOS Simulator

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the demo app

Start the dev server (esbuild watcher + RSC server):

```bash
npm run dev
```

Then open `fixtures/Falcon.xcworkspace` in Xcode and run the **Falcon Demo** scheme on a simulator. The app auto-reloads via WebSocket when JS changes.

### 3. Run tests

```bash
# Unit + server action tests
npm test

# Integration tests (requires fantom binary)
npm run build:fantom
npm run test:fantom

# All tests
npm run test:all
```

### 4. Layout comparison (E2E)

Compare native rendering against web rendering:

```bash
npm run build:e2e    # Build layout fixtures
npm run e2e:test     # Run comparison
```

## CLI Reference

See [docs/cli-reference.md](docs/cli-reference.md) for the full list of UI automation, debugging, and test commands.

## Documentation

- [Architecture](docs/architecture.md) — Full system design
- [CLI Reference](docs/cli-reference.md) — Build, test, debug commands
- [Specs](docs/specs/) — Component and protocol specifications
- [Plans](docs/plans/) — Implementation plans and design docs

## License

MIT
