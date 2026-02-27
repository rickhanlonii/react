# startTransition During Hydration and Root Updates While Shell Is Suspended

## Category
hydration

## Description
Validates the interaction between `startTransition` and hydration. Specifically: (1) updating the root at lower priority than initial hydration using `startTransition` does not force a client re-render — hydration completes first, then the update is applied. (2) Updating the root while the shell is suspended forces a client render with a recoverable error message. This test covers the boundary between cooperative hydration and forced client rendering.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — "updating the root at lower priority than initial hydration does not force a client render"
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — "updating the root while the shell is suspended forces a client render"

## App Setup

### Scenario A: startTransition update during normal hydration
```jsx
function App({ text }) {
  return <div id="app">{text}</div>;
}

// Server renders <App text="Initial" />
// Client:
const root = hydrateRoot(container, <App text="Initial" />);
startTransition(() => {
  root.render(<App text="Updated" />);
});
```

### Scenario B: Root update while shell is suspended
```jsx
const textCache = new Map();

function readText(text) {
  const record = textCache.get(text);
  if (record !== undefined) {
    if (record.status === 'pending') throw record.promise;
    return record.value;
  }
  // ... suspend logic
}

function ShellApp() {
  const data = readText('Shell');
  return <div id="shell-app">{data}</div>;
}

function FallbackApp({ text }) {
  return <div id="fallback-app">{text}</div>;
}

// Server renders <ShellApp /> with data pre-resolved.
// Client: text cache is empty, so shell suspends.
const root = hydrateRoot(container, <ShellApp />, {
  onRecoverableError(error) {
    // logs the error
  },
});

// While shell is suspended, update the root:
root.render(<FallbackApp text="New screen" />);
```

## Load Sequence

### Scenario A:
1. Server renders `<App text="Initial" />` producing `<div id="app">Initial</div>`.
2. Browser paints "Initial".
3. Client JS loads.
4. `hydrateRoot` is called with `<App text="Initial" />`.
5. Immediately after, `startTransition(() => root.render(<App text="Updated" />))` is called.
6. React hydrates first (higher priority), confirming the DOM matches.
7. Then React processes the transition update, rendering "Updated".

### Scenario B:
1. Server renders `<ShellApp />` producing `<div id="shell-app">Shell</div>`.
2. Browser paints "Shell".
3. Client JS loads. Text cache is empty.
4. `hydrateRoot(container, <ShellApp />)` is called. Shell suspends.
5. While suspended, `root.render(<FallbackApp text="New screen" />)` is called.
6. React abandons hydration and switches to full client render.
7. `onRecoverableError` is called with a message about early update forcing client rendering.

## Actions
1. **Scenario A**: Load the page, trigger a `startTransition` update immediately after `hydrateRoot`.
2. **Scenario A**: Wait for both hydration and the transition to complete.
3. **Scenario B**: Load the page, observe shell suspension.
4. **Scenario B**: While shell is suspended, call `root.render()` with new content.
5. **Scenario B**: Observe the switch to client rendering.

## Assertions

### Scenario A:
1. After hydration: the text shows "Initial" (hydration completes first, matching the server).
2. After transition: the text updates to "Updated".
3. The DOM node `<div id="app">` is the same server-rendered node (hydration reused it).
4. No hydration errors or warnings — `startTransition` at lower priority does not interfere.

### Scenario B:
1. During shell suspension: server-rendered "Shell" text remains visible.
2. After calling `root.render()`: React abandons hydration and switches to client rendering.
3. After client render: the page shows "New screen".
4. `onRecoverableError` is called with a message like "This root received an early update, before anything was able hydrate. Switched the entire root to client rendering."
5. The final DOM contains `<div id="fallback-app">New screen</div>`.
6. The app is interactive and functional after the forced client render.
