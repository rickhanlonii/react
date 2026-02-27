# Attribute Rendering: Boolean, Data, Custom, Style, and className

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles different types of HTML attributes: boolean attributes (like `disabled`, `checked`), `data-*` attributes, custom attributes, inline `style` objects converted to CSS strings, and `className` mapped to the `class` attribute. This ensures the server-rendered HTML is semantically correct and hydration-compatible.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (attribute rendering tests)
- `packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js` (attribute serialization)

## App Setup
```jsx
function AttributeApp() {
  return (
    <div>
      {/* Boolean attributes */}
      <input id="disabled-input" type="text" disabled />
      <input id="enabled-input" type="text" disabled={false} />
      <input id="readonly-input" type="text" readOnly />
      <details id="open-details" open>
        <summary>Summary</summary>
        Content
      </details>

      {/* className -> class */}
      <div id="classname" className="foo bar baz">Classed</div>

      {/* style objects */}
      <div id="styled" style={{
        color: 'red',
        backgroundColor: 'blue',
        fontSize: '16px',
        marginTop: 10,
        WebkitTransform: 'rotate(45deg)',
      }}>
        Styled
      </div>

      {/* data-* attributes */}
      <div id="data-attrs" data-testid="my-element" data-custom="value" data-count="42">
        Data
      </div>

      {/* aria-* attributes */}
      <div id="aria-attrs" aria-label="Close" aria-hidden="true" role="button">
        Aria
      </div>

      {/* Custom attributes */}
      <div id="custom" mycustomattr="custom-value">Custom</div>

      {/* htmlFor -> for */}
      <label id="label" htmlFor="input-id">Label</label>

      {/* tabIndex */}
      <div id="tabindex" tabIndex={0}>Focusable</div>

      {/* null/undefined attributes should be omitted */}
      <div id="omitted" data-present="yes" data-gone={null} data-also-gone={undefined}>
        Omitted
      </div>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<AttributeApp />)`.

## Load Sequence
1. Server renders all elements with their attributes in a single synchronous pass.
2. HTML is flushed as one chunk.
3. Client receives HTML and hydrates.

## Actions
1. Server-render `<AttributeApp />` using `renderToPipeableStream` and pipe to a writable stream.
2. Collect the full HTML output string.
3. Parse the HTML into a DOM.
4. Hydrate with `hydrateRoot`.

## Assertions
1. `#disabled-input` has the `disabled` attribute present with empty string value (boolean attribute).
2. `#enabled-input` does NOT have the `disabled` attribute (false boolean is omitted).
3. `#readonly-input` has `readonly=""` attribute.
4. `#open-details` has the `open=""` attribute.
5. `#classname` has `class="foo bar baz"` (not `className`).
6. `#styled` has a `style` attribute containing `color:red;background-color:blue;font-size:16px;margin-top:10px;-webkit-transform:rotate(45deg)` (camelCase converted to kebab-case, unitless numbers get `px` where appropriate, vendor prefixes handled).
7. `#data-attrs` has `data-testid="my-element"`, `data-custom="value"`, and `data-count="42"`.
8. `#aria-attrs` has `aria-label="Close"`, `aria-hidden="true"`, and `role="button"`.
9. `#custom` has `mycustomattr="custom-value"`.
10. `#label` has `for="input-id"` (not `htmlFor`).
11. `#tabindex` has `tabindex="0"` (lowercase).
12. `#omitted` has `data-present="yes"` but does NOT have `data-gone` or `data-also-gone` attributes.
13. Hydration completes without mismatch warnings.
