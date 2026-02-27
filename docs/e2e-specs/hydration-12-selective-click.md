# Click Event Triggers Selective Hydration of Suspense Boundary

## Category
hydration

## Description
Validates that clicking on a not-yet-hydrated Suspense boundary triggers selective hydration of that specific boundary synchronously during the click event. React prioritizes hydrating the boundary that received the user interaction, potentially skipping other boundaries that have not yet been hydrated. The click handler fires after the targeted boundary hydrates, and remaining boundaries hydrate afterward at normal priority.

## References
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates the target boundary synchronously during a click"
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates at higher pri for secondary discrete events"

## App Setup
```jsx
function Child({ text }) {
  return (
    <span
      id={`child-${text}`}
      onClick={e => {
        e.preventDefault();
        document.getElementById('log').textContent += `Clicked ${text}\n`;
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
      <pre id="log"></pre>
    </div>
  );
}
```

Server renders all three `<Suspense>` boundaries with their full content. On the client, hydration begins but all three boundaries are pending hydration.

## Load Sequence
1. Server renders `<App />` using `renderToString` or `renderToPipeableStream`, producing complete HTML with all three children.
2. Browser paints server HTML: spans "A", "B", "C" are visible but not interactive.
3. Client JS loads.
4. `hydrateRoot(container, <App />)` is called.
5. Hydration begins but boundaries are not yet hydrated (React has not yielded to process them yet).
6. User clicks on span "B" before hydration completes.
7. React synchronously hydrates the Suspense boundary containing "B" in response to the click.
8. The click handler fires: "Clicked B" is logged.
9. React continues hydrating remaining boundaries (A, then C) at normal priority.

## Actions
1. Load the server-rendered page.
2. Before hydration completes, click on span "B".
3. Observe whether the click handler fires.
4. Wait for all remaining boundaries to hydrate.
5. Click on span "A" to verify it is now interactive.

## Assertions
1. Before any hydration: all three spans ("A", "B", "C") are visible with server-rendered content.
2. When the user clicks on span "B": React selectively hydrates the boundary containing "B" synchronously.
3. The click event's `preventDefault` is called, and "Clicked B" appears in the log.
4. After the click-triggered hydration of "B", the remaining boundaries ("A" and "C") hydrate at normal priority.
5. After full hydration: clicking span "A" logs "Clicked A" and clicking span "C" logs "Clicked C".
6. No hydration warnings or errors.
7. The DOM nodes for all spans are the original server-rendered nodes.
