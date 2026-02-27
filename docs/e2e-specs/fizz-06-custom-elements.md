# Custom Elements (Web Components) with Children, Properties vs Attributes

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles custom elements (web components). During SSR, React must serialize properties as attributes since the custom element class is not available on the server. The renderer should handle children of custom elements, pass through unknown attributes, and ensure that properties set on the client during hydration match the server output.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (custom element tests)
- `packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js` (custom element attribute handling)

## App Setup
```jsx
function CustomElementApp() {
  return (
    <div>
      {/* Custom element with string attributes */}
      <my-component id="basic-custom" greeting="hello" count="5">
        <span>Child content</span>
      </my-component>

      {/* Custom element with boolean-like attribute */}
      <my-toggle id="toggle-custom" active="" />

      {/* Custom element with className */}
      <my-widget id="class-custom" className="styled-widget">
        Widget content
      </my-widget>

      {/* Custom element with style */}
      <my-card id="style-custom" style={{ color: 'red', padding: '10px' }}>
        Card content
      </my-card>

      {/* Custom element with nested custom elements */}
      <my-list id="nested-custom">
        <my-item>Item 1</my-item>
        <my-item>Item 2</my-item>
        <my-item>Item 3</my-item>
      </my-list>

      {/* Custom element with event-like attributes */}
      <my-button id="event-custom" label="Click me" />

      {/* Custom element with data attributes */}
      <my-input id="data-custom" data-type="email" data-required="true" />
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<CustomElementApp />)`.

## Load Sequence
1. Server renders custom elements as regular HTML elements with hyphenated tag names.
2. Attributes are serialized as HTML attributes (string values).
3. Children are rendered normally inside the custom element tags.
4. HTML is flushed to the client.
5. On the client, when custom element classes are registered, the browser upgrades the elements.
6. Hydration attaches React's event system and reconciles properties.

## Actions
1. Server-render `<CustomElementApp />` and collect HTML output.
2. Verify the raw HTML contains proper custom element tags.
3. Parse the HTML into a DOM.
4. Hydrate with `hydrateRoot`.

## Assertions
1. `#basic-custom` is rendered as `<my-component>` tag with `greeting="hello"` and `count="5"` attributes.
2. `#basic-custom` contains a `<span>Child content</span>` child element.
3. `#toggle-custom` is rendered as `<my-toggle>` with `active=""` attribute.
4. `#class-custom` has `class="styled-widget"` attribute (className mapped to class).
5. `#style-custom` has a `style` attribute with `color:red;padding:10px`.
6. `#nested-custom` is rendered as `<my-list>` containing three `<my-item>` children.
7. Each `<my-item>` contains its respective text content.
8. `#event-custom` has `label="Click me"` attribute.
9. `#data-custom` has `data-type="email"` and `data-required="true"` attributes.
10. Hydration completes without warnings.
11. After hydration, the custom element DOM nodes are the same (reused, not replaced).
