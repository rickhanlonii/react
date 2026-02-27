# Suspense Boundaries Hydrate Selectively Based on User Interaction Priority

## Category
hydration

## Description
Validates that when multiple Suspense boundaries exist and some are blocked (their content is still loading), user interactions determine which boundaries get hydrated first. Discrete events (clicks) have higher priority than continuous events (hover), which have higher priority than idle hydration. A click on boundary D should cause D to hydrate before other boundaries, even if A was queued for hydration first.

## References
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates at higher pri if sync did not work first time"
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates the hovered targets as higher priority for continuous events"
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates at higher pri for secondary discrete events"

## App Setup
```jsx
let suspend = false;
let resolvePromise;
const promise = new Promise(resolve => (resolvePromise = resolve));

function Child({ text }) {
  if ((text === 'A' || text === 'D') && suspend) {
    throw promise;
  }
  return (
    <span
      id={`span-${text}`}
      onClick={e => {
        e.preventDefault();
        document.getElementById('log').textContent += `Clicked ${text}\n`;
      }}
      onMouseEnter={() => {
        document.getElementById('log').textContent += `Hover ${text}\n`;
      }}
    >
      {text}
    </span>
  );
}

function App() {
  return (
    <div>
      <Suspense fallback="Loading A...">
        <Child text="A" />
      </Suspense>
      <Suspense fallback="Loading B...">
        <Child text="B" />
      </Suspense>
      <Suspense fallback="Loading C...">
        <Child text="C" />
      </Suspense>
      <Suspense fallback="Loading D...">
        <Child text="D" />
      </Suspense>
      <pre id="log"></pre>
    </div>
  );
}
```

On the server, `suspend = false` so all children render. On the client, `suspend = true` so children A and D are blocked during hydration until the promise resolves.

## Load Sequence
1. Server renders `<App />` with all four children visible.
2. Browser paints all four spans.
3. Client JS loads. `suspend = true` on the client.
4. `hydrateRoot(container, <App />)` is called.
5. React begins hydrating. A and D suspend, so B and C are hydrated first.
6. User clicks on span D (which is still suspended).
7. React queues D for priority hydration once the promise resolves.
8. The promise resolves (`suspend = false`).
9. React hydrates D first (click priority), then A (remaining).

## Actions
1. Load the server-rendered page.
2. While A and D are still suspended, click on span D.
3. While A and D are still suspended, hover over span B, then hover over span C.
4. Resolve the suspending promise.
5. Observe the hydration order and event replay.

## Assertions
1. Before any hydration: all four spans are visible with server-rendered content.
2. B and C hydrate before A and D (since A and D are suspended).
3. After clicking on span D: React records the intent to hydrate D with high priority.
4. Hovering C after clicking D: the hover on C is lower priority than the click on D.
5. After the promise resolves: D hydrates before A because D received a discrete click event.
6. After D hydrates: the click event fires (or is replayed) and "Clicked D" appears in the log.
7. After all hydration completes: A hydrates last.
8. The hover event on C fires after C is hydrated: "Hover C" appears in the log.
9. All spans are the original server-rendered DOM nodes.
