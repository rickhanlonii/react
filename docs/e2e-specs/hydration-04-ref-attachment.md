# Ref Attachment After Hydration

## Category
hydration

## Description
Validates that refs (`useRef`, callback refs, and `createRef`) are correctly attached to the server-rendered DOM nodes after hydration. Before hydration completes, refs should be `null`. After hydration, each ref should point to the exact same DOM node that the server rendered, not a newly created one.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — "should be able to render and hydrate forwardRef components" (ref.current after hydration)
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — "hydrates a parent even if a child Suspense boundary is blocked" (ref on span)

## App Setup
```jsx
function App() {
  const useRefDiv = React.useRef(null);
  const callbackRefSpan = React.useRef(null);
  const [refAttached, setRefAttached] = React.useState(false);

  React.useEffect(() => {
    // After hydration, refs should be populated
    if (useRefDiv.current && callbackRefSpan.current) {
      setRefAttached(true);
    }
  }, []);

  return (
    <div>
      <div id="use-ref-target" ref={useRefDiv}>
        useRef target
      </div>

      <span
        id="callback-ref-target"
        ref={node => {
          callbackRefSpan.current = node;
        }}
      >
        Callback ref target
      </span>

      <ForwardedChild />

      <p id="ref-status">{refAttached ? 'Refs attached' : 'Waiting'}</p>
    </div>
  );
}

const ForwardedChild = React.forwardRef(function ForwardedChild(props, ref) {
  const innerRef = React.useRef(null);
  return (
    <div id="forwarded-ref-target" ref={ref || innerRef}>
      Forwarded ref child
    </div>
  );
});

// Usage at root:
const forwardedRef = React.createRef();
hydrateRoot(
  container,
  <App />,
);
```

## Load Sequence
1. Server renders `<App />` to HTML with all three target elements.
2. Browser displays server HTML. No refs are attached (no JS yet).
3. Client JS loads and `hydrateRoot` is called.
4. React walks the existing DOM and attaches refs to the server-rendered nodes.
5. `useEffect` fires after hydration, confirming refs are populated.

## Actions
1. Load the page and observe server-rendered HTML.
2. Wait for hydration to complete.
3. Verify that `useRef` ref points to the correct DOM node.
4. Verify that callback ref was invoked with the correct DOM node.
5. Verify that the forwarded ref points to the correct DOM node.
6. Wait for the effect to fire and update the status text.

## Assertions
1. Before hydration: the page shows "useRef target", "Callback ref target", "Forwarded ref child", and "Waiting".
2. After hydration: `useRefDiv.current` is the `<div id="use-ref-target">` DOM node that was server-rendered.
3. After hydration: `callbackRefSpan.current` is the `<span id="callback-ref-target">` DOM node that was server-rendered.
4. The callback ref function was called exactly once during hydration with the DOM node as its argument.
5. After hydration: the forwarded ref (if used at the root) points to `<div id="forwarded-ref-target">`.
6. After the effect fires: the status text updates from "Waiting" to "Refs attached".
7. All ref targets are the same DOM nodes that existed in the server-rendered HTML (not re-created).
8. No hydration warnings or errors.
