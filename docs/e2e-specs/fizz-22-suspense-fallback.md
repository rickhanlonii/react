# Suspense Boundary Fallback Rendering on Server

## Category
fizz

## Description
Validates that Suspense boundary fallback content is correctly rendered in the server HTML when the inner content suspends. The fallback is wrapped in special comment markers (`<!--$?-->` and `<!--/$-->`) that the Fizz client runtime uses to identify pending boundaries. The fallback HTML is placed inside a `<template>` element to hide it from display until the real content arrives.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (Suspense fallback rendering)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerBrowser-test.js` (fallback in browser stream)

## App Setup
```jsx
let resolveContent;
const contentPromise = new Promise(r => { resolveContent = r; });

function AsyncContent() {
  const data = React.use(contentPromise);
  return <div id="real-content">{data}</div>;
}

function SuspenseFallbackApp() {
  return (
    <div id="app">
      <h1>Page Title</h1>

      {/* Simple Suspense with text fallback */}
      <Suspense fallback="Loading...">
        <AsyncContent />
      </Suspense>

      {/* Suspense with complex JSX fallback */}
      <Suspense fallback={
        <div id="skeleton" className="loading-skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-body">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        </div>
      }>
        <AsyncContent />
      </Suspense>

      {/* Suspense with no fallback (implicit null) */}
      <Suspense>
        <AsyncContent />
      </Suspense>

      {/* Suspense with immediately available content (no suspension) */}
      <Suspense fallback={<div>This fallback should not show</div>}>
        <div id="sync-content">Immediately available</div>
      </Suspense>

      <footer>Footer</footer>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<SuspenseFallbackApp />)`.

## Load Sequence
1. Server renders the component tree.
2. When it encounters `<AsyncContent />` which suspends, it renders the fallback instead.
3. The fallback HTML is placed inside the Suspense boundary markers in the shell.
4. For the sync content Suspense boundary, the content renders directly (no fallback needed).
5. Shell is flushed with fallbacks in place.
6. When the promise resolves later, a streaming chunk replaces each fallback.

## Actions
1. Server-render `<SuspenseFallbackApp />` and capture the shell HTML.
2. Inspect the Suspense boundary markers and fallback content.
3. Verify sync content rendered inline without fallback.
4. Resolve the async content.
5. Capture streaming chunks.
6. Verify the final DOM after all content arrives.

## Assertions
1. The shell HTML contains `<h1>Page Title</h1>` as synchronous content.
2. The shell HTML contains `<footer>Footer</footer>` as synchronous content.
3. The first Suspense boundary includes the text "Loading..." as fallback content, wrapped in pending boundary markers (`<!--$?-->` and `<!--/$-->`).
4. The second Suspense boundary includes the complex skeleton JSX with `id="skeleton"` and nested divs with `className` rendered as `class`.
5. The third Suspense boundary (no fallback prop) renders an empty pending boundary.
6. The fourth Suspense boundary renders `<div id="sync-content">Immediately available</div>` directly with completed boundary markers (`<!--$-->` and `<!--/$-->`), not the fallback.
7. The fallback content is visible in the initial page (not hidden by `<template>`).
8. After resolving, streaming chunks arrive with `<script>` tags that swap the fallback content with `<div id="real-content">...</div>`.
9. After all streaming completes, no fallback content remains visible.
