# ViewTransition Component Annotations in SSR Output

## Category
fizz

## Description
Validates that the `ViewTransition` component emits correct HTML annotations during Fizz server-side rendering. `ViewTransition` (from `React.ViewTransition`) adds `vt-*` attributes to its child element to enable the View Transitions API for smooth transitions. During SSR, these annotations must be present in the HTML so that the initial render is already annotated, and hydration can pick up the transition configuration without mismatches.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzViewTransition-test.js` (ViewTransition SSR tests)

## App Setup
```jsx
const ViewTransition = React.ViewTransition;

function ViewTransitionApp() {
  return (
    <div id="app">
      {/* Default ViewTransition (auto update) */}
      <ViewTransition>
        <div id="auto-update">Auto update transition</div>
      </ViewTransition>

      {/* Named ViewTransition with update and share */}
      <ViewTransition name="hero-image" update="morph" share="hero">
        <img id="hero" src="hero.jpg" alt="Hero" />
      </ViewTransition>

      {/* ViewTransition with object update (multiple triggers) */}
      <ViewTransition update={{ something: 'slide', default: 'fade' }}>
        <div id="object-update">Object update transition</div>
      </ViewTransition>

      {/* Nested ViewTransitions */}
      <ViewTransition name="card" update="slide" share="card-pair">
        <ViewTransition>
          <div id="nested-inner">Nested inner content</div>
        </ViewTransition>
      </ViewTransition>

      {/* ViewTransition inside Suspense */}
      <Suspense fallback={
        <ViewTransition>
          <div id="fallback-transition">Loading...</div>
        </ViewTransition>
      }>
        <ViewTransition name="content" update="crossfade">
          <AsyncContent />
        </ViewTransition>
      </Suspense>
    </div>
  );
}

let resolveContent;
const contentPromise = new Promise(r => { resolveContent = r; });

function AsyncContent() {
  const data = React.use(contentPromise);
  return <div id="async-content">{data}</div>;
}
```

Server renders via `renderToPipeableStream(<ViewTransitionApp />)`.

## Load Sequence
1. Server renders the component tree.
2. `ViewTransition` components do not add wrapper DOM elements; they annotate their child element with `vt-*` attributes.
3. The `vt-update` attribute indicates the update transition type.
4. The `vt-name` attribute provides a unique view transition name.
5. The `vt-share` attribute indicates shared element transitions.
6. For object `update` values, the `default` key determines the `vt-update` attribute value.
7. Shell is flushed with annotations.
8. During hydration, React reads these annotations and sets up the ViewTransition behavior.

## Actions
1. Server-render `<ViewTransitionApp />` and collect HTML output.
2. Parse the HTML and inspect `vt-*` attributes.
3. Resolve the async content.
4. Capture streaming chunk and verify transition annotations.
5. Hydrate with `hydrateRoot`.

## Assertions
1. `#auto-update` has `vt-update="auto"` attribute (default transition type).
2. `#auto-update` does NOT have `vt-name` or `vt-share` (not specified).
3. `#hero` has `vt-name="hero-image"`, `vt-update="morph"`, and `vt-share="hero"` attributes.
4. `#object-update` has `vt-update="fade"` (from the `default` key of the update object).
5. The outer `ViewTransition` for nested applies to the intermediate element: the outer ViewTransition annotates its child with `vt-name="card"`, `vt-update="slide"`, `vt-share="card-pair"`.
6. `#nested-inner` has `vt-update="auto"` from the inner ViewTransition.
7. In the Suspense fallback, `#fallback-transition` has `vt-update="auto"`.
8. After the async content resolves, `#async-content` has the `vt-name="content"` and `vt-update="crossfade"` annotations.
9. No `ViewTransition` component adds a wrapper element to the DOM (annotations are placed directly on the child).
10. Hydration completes without mismatch warnings about `vt-*` attributes.
11. After hydration, the ViewTransition behavior is active for client-side navigation transitions.
