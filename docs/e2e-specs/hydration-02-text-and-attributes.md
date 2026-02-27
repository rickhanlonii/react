# Hydration of Text Nodes, Element Attributes, className, style, and data-* Attributes

## Category
hydration

## Description
Validates that React correctly hydrates text nodes and various element attributes including `className`, inline `style`, `data-*` attributes, boolean attributes like `disabled`, and HTML attributes like `id` and `title`. Server-rendered HTML should be reused exactly as-is when the client tree matches.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — style property tests
- `packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js` — text mismatch warnings

## App Setup
```jsx
function App() {
  return (
    <div id="container" className="app-root" data-testid="main-app">
      <h1 className="title" style={{ color: 'blue', fontSize: '24px' }}>
        Welcome
      </h1>
      <p data-section="intro" title="Introduction paragraph">
        This is a <strong>bold</strong> statement with <em>emphasis</em>.
      </p>
      <span>Plain text node</span>
      <span>{42}</span>
      <span>{true && 'Conditional text'}</span>
      <input
        type="text"
        placeholder="Enter name"
        disabled={false}
        className="input-field"
        data-form="signup"
      />
      <div style={{ backgroundColor: 'red', padding: '10px', margin: '5px' }}>
        Styled div
      </div>
    </div>
  );
}
```

Server renders the full component tree. The resulting HTML contains properly serialized `className` (as `class`), inline `style` (as CSS string), `data-*` attributes, and text nodes including numeric and conditional text.

## Load Sequence
1. Server renders `<App />` and sends complete HTML.
2. Browser paints server-rendered content.
3. Client JS loads and calls `hydrateRoot(container, <App />)`.
4. React walks the DOM, verifying text nodes, attributes, and styles match.
5. Hydration completes without warnings.

## Actions
1. Load the page with server-rendered HTML.
2. Wait for hydration to complete.
3. Inspect each element's attributes and text content.

## Assertions
1. The `<div id="container">` has `class="app-root"` and `data-testid="main-app"`.
2. The `<h1>` has `class="title"` and `style="color: blue; font-size: 24px;"` (or equivalent browser-normalized form).
3. The `<p>` has `data-section="intro"` and `title="Introduction paragraph"`.
4. Text nodes inside `<p>` include "This is a ", "bold", " statement with ", "emphasis", and ".".
5. The `<span>` elements contain "Plain text node", "42", and "Conditional text" respectively.
6. The `<input>` has `type="text"`, `placeholder="Enter name"`, `class="input-field"`, `data-form="signup"`, and is not disabled.
7. The styled `<div>` has `background-color: red`, `padding: 10px`, `margin: 5px`.
8. No hydration warnings or errors appear in the console.
9. All DOM nodes are the same references as the server-rendered ones (no re-creation).
