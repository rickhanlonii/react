# Special Form Elements: select, input, textarea, checkbox

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles special form elements that have unique server rendering behavior: `<select>` with `defaultValue` rendering the correct `<option>` as selected, `<textarea>` with `defaultValue` rendering content inside the element, `<input>` types with `defaultValue`/`defaultChecked`, and checkbox/radio inputs with `checked` state.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (select, input, textarea tests)
- `packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js` (special element handling)

## App Setup
```jsx
function SpecialElementsApp() {
  return (
    <div>
      {/* Select with defaultValue */}
      <select id="select-default" defaultValue="b">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
        <option value="c">Option C</option>
      </select>

      {/* Select with multiple and defaultValue array */}
      <select id="select-multiple" multiple defaultValue={['a', 'c']}>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
        <option value="c">Option C</option>
      </select>

      {/* Textarea with defaultValue */}
      <textarea id="textarea-default" defaultValue="Hello World" />

      {/* Textarea with children (equivalent to defaultValue) */}
      <textarea id="textarea-children">Initial text content</textarea>

      {/* Input with defaultValue */}
      <input id="input-text" type="text" defaultValue="default text" />

      {/* Checkbox with defaultChecked */}
      <input id="checkbox-checked" type="checkbox" defaultChecked />
      <input id="checkbox-unchecked" type="checkbox" defaultChecked={false} />

      {/* Radio with defaultChecked */}
      <input id="radio-a" type="radio" name="group" value="a" defaultChecked />
      <input id="radio-b" type="radio" name="group" value="b" />

      {/* Hidden input */}
      <input id="hidden" type="hidden" value="secret" />

      {/* Number input */}
      <input id="number" type="number" defaultValue={42} />
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<SpecialElementsApp />)`.

## Load Sequence
1. Server renders all form elements with their default states.
2. For `<select>`, the server adds `selected` attribute to the matching `<option>`.
3. For `<textarea>`, the server places `defaultValue` as text content inside the element.
4. For `<input>`, `defaultValue` becomes the `value` attribute and `defaultChecked` becomes the `checked` attribute.
5. HTML is flushed and client can hydrate.

## Actions
1. Server-render `<SpecialElementsApp />` and collect HTML output.
2. Parse the HTML and inspect the DOM elements.
3. Hydrate with `hydrateRoot`.
4. Verify form element states match after hydration.

## Assertions
1. In `#select-default`, the `<option value="b">` has the `selected` attribute; options A and C do not.
2. In `#select-multiple`, both `<option value="a">` and `<option value="c">` have `selected`; option B does not.
3. `#textarea-default` contains `Hello World` as its text content in the HTML output.
4. `#textarea-children` contains `Initial text content` as its text content.
5. `#input-text` has `value="default text"` in the HTML output.
6. `#checkbox-checked` has the `checked` attribute present.
7. `#checkbox-unchecked` does NOT have the `checked` attribute.
8. `#radio-a` has `checked` attribute; `#radio-b` does not.
9. `#hidden` has `value="secret"`.
10. `#number` has `value="42"`.
11. Hydration completes without mismatch warnings.
12. After hydration, `.value` and `.checked` properties on DOM elements match the expected defaults.
