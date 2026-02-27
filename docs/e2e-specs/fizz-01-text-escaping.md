# Text Content Rendering with HTML Escaping and Text Separators

## Category
fizz

## Description
Validates that the Fizz renderer correctly escapes HTML special characters in text content and inserts text separators (comment nodes) between adjacent text nodes to preserve text boundaries during hydration. This is fundamental to preventing XSS and ensuring correct DOM structure.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (text rendering tests)
- `packages/react-server/src/ReactFizzServer.js` (text segment encoding)

## App Setup
```jsx
function TextEscapingApp() {
  const dangerous = '<script>alert("xss")</script>';
  const ampersand = 'Tom & Jerry';
  const quotes = 'She said "hello"';
  const multipleTexts = ['Hello', ' ', 'World'];

  return (
    <div>
      {/* Basic text escaping */}
      <p id="escaped">{dangerous}</p>

      {/* Ampersand escaping */}
      <p id="ampersand">{ampersand}</p>

      {/* Quote escaping in text content */}
      <p id="quotes">{quotes}</p>

      {/* Adjacent text nodes with separators */}
      <p id="adjacent">
        {'Hello'}{'World'}
      </p>

      {/* Multiple adjacent text nodes */}
      <p id="multi">
        {'A'}{'B'}{'C'}
      </p>

      {/* Text next to elements */}
      <p id="mixed">
        {'Before'}<span>Middle</span>{'After'}
      </p>

      {/* Numeric text */}
      <p id="number">{42}</p>

      {/* Empty string */}
      <p id="empty">{''}</p>

      {/* Special HTML entities */}
      <p id="entities">{'<div>&amp;&lt;&gt;</div>'}</p>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<TextEscapingApp />)`.

## Load Sequence
1. Server renders the full component tree synchronously (no Suspense boundaries).
2. HTML is flushed as a single chunk containing all escaped text content.
3. Client receives the HTML and can hydrate with `hydrateRoot`.
4. During hydration, text separators (comment nodes like `<!-- -->`) ensure adjacent text nodes are split correctly.

## Actions
1. Server-render `<TextEscapingApp />` using `renderToPipeableStream` and pipe to a writable stream.
2. Collect the full HTML output.
3. Inspect the raw HTML string for correct escaping.
4. Load the HTML into a DOM environment.
5. Hydrate with `hydrateRoot` using the same component tree.

## Assertions
1. The raw HTML for `#escaped` contains `&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;` -- angle brackets and quotes are escaped.
2. The raw HTML for `#ampersand` contains `Tom &amp; Jerry`.
3. The text content of `#escaped` reads `<script>alert("xss")</script>` when accessed via `textContent` (browser unescapes).
4. Between adjacent text nodes in `#adjacent`, a comment separator `<!-- -->` is present in the raw HTML so that `Hello` and `World` remain distinct text nodes.
5. The `#multi` paragraph has comment separators between `A`, `B`, and `C`.
6. The `#number` paragraph contains the text `42`.
7. The `#entities` paragraph escapes the literal string `<div>&amp;&lt;&gt;</div>` so it displays as text, not as HTML.
8. Hydration completes without mismatch warnings.
9. After hydration, `textContent` of each element matches the original React values.
