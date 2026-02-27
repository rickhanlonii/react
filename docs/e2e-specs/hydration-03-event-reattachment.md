# Event Listener Reattachment During Hydration

## Category
hydration

## Description
Validates that event listeners (`onClick`, `onChange`, `onSubmit`, `onMouseEnter`, etc.) are correctly reattached to server-rendered DOM nodes during hydration. Before hydration, user interactions should not trigger React handlers. After hydration, all event handlers must work as expected on the original server-rendered DOM nodes.

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — "should have the correct mounting behavior" (click after hydration)
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates the target boundary synchronously during a click"

## App Setup
```jsx
function App() {
  const [clicks, setClicks] = React.useState(0);
  const [inputValue, setInputValue] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);

  return (
    <div>
      <button id="click-btn" onClick={() => setClicks(c => c + 1)}>
        Clicks: {clicks}
      </button>

      <input
        id="text-input"
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
      />
      <span id="input-mirror">{inputValue}</span>

      <form
        id="test-form"
        onSubmit={e => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <button type="submit" id="submit-btn">Submit</button>
      </form>
      <span id="submit-status">{submitted ? 'Submitted' : 'Not submitted'}</span>

      <div
        id="hover-target"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hovered ? 'Hovered!' : 'Hover me'}
      </div>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App />` to HTML. All interactive elements are present but have no JavaScript behavior.
2. HTML is sent to the browser and painted.
3. Client JS loads.
4. `hydrateRoot(container, <App />)` is called.
5. React attaches event handlers via delegated events at the root.
6. All interactive elements become functional.

## Actions
1. Before hydration: click the button, type in the input, submit the form.
2. Wait for hydration to complete.
3. Click the "Clicks: 0" button once.
4. Click the button again.
5. Type "hello" into the text input.
6. Click the "Submit" button.
7. Hover over the "Hover me" div, then move the mouse away.

## Assertions
1. Before hydration: clicking the button does not change its text from "Clicks: 0".
2. After hydration: clicking the button updates text to "Clicks: 1".
3. After second click: text updates to "Clicks: 2".
4. After typing "hello": the input value is "hello" and the mirror span shows "hello".
5. After clicking Submit: the status span changes from "Not submitted" to "Submitted".
6. The default form submission is prevented (page does not reload).
7. On mouse enter: the hover target text changes to "Hovered!".
8. On mouse leave: the hover target text reverts to "Hover me".
9. No hydration warnings or errors in the console.
10. The DOM nodes for button, input, and form are the same references as the server-rendered ones.
