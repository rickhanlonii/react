# Focus Management During Selective Hydration

## Category
hydration

## Description
Validates that focus is correctly managed during selective hydration. When a user focuses an element inside a not-yet-hydrated Suspense boundary, React should hydrate that boundary and preserve or restore focus on the element. The `autoFocus` attribute should be emitted on the server but should NOT trigger `focus()` calls during hydration (to avoid disrupting existing focus state).

## References
- `packages/react-dom/src/__tests__/ReactServerRenderingHydration-test.js` — "should emit autofocus on the server but not focus() when hydrating"
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — selective hydration on interaction

## App Setup
```jsx
function LoginForm() {
  const [username, setUsername] = React.useState('');
  const [focused, setFocused] = React.useState('');

  return (
    <form id="login-form">
      <input
        id="username-input"
        type="text"
        value={username}
        onChange={e => setUsername(e.target.value)}
        onFocus={() => setFocused('username')}
        onBlur={() => setFocused('')}
        placeholder="Username"
      />
      <input
        id="password-input"
        type="password"
        placeholder="Password"
        onFocus={() => setFocused('password')}
        onBlur={() => setFocused('')}
      />
      <input
        id="autofocus-input"
        type="text"
        autoFocus={true}
        placeholder="Autofocus field"
      />
      <p id="focus-indicator">Focused: {focused || 'none'}</p>
    </form>
  );
}

function App() {
  return (
    <div>
      <Suspense fallback="Loading...">
        <LoginForm />
      </Suspense>
    </div>
  );
}
```

## Load Sequence
1. Server renders `<App />`. The `<input autoFocus>` has the `autofocus` attribute in the HTML.
2. Browser paints the form. The browser may natively focus the autofocus input.
3. Client JS loads.
4. `hydrateRoot(container, <App />)` is called.
5. React hydrates the Suspense boundary. It does NOT call `focus()` on the autoFocus input during hydration.
6. If the user clicks on the username input before hydration, React selectively hydrates and preserves focus.

## Actions
1. Load the server-rendered page.
2. Observe whether the autofocus input has the `autofocus` attribute in the server HTML.
3. Before hydration completes, click on the username input to focus it.
4. Wait for hydration to complete.
5. Verify focus is on the username input (not stolen by hydration).
6. Type "testuser" into the username input.
7. Tab to the password input.

## Assertions
1. The server-rendered `<input id="autofocus-input">` has the `autofocus` attribute set in the HTML.
2. During hydration: React does NOT programmatically call `focus()` on the autofocus input.
3. If the user focused the username input before hydration: focus remains on the username input after hydration (not moved to the autofocus input).
4. After hydration: the `onFocus` handler fires when an input receives focus, updating the focus indicator.
5. After typing "testuser": the username input contains "testuser".
6. After tabbing to the password input: the focus indicator shows "password".
7. No hydration warnings or errors.
8. The form elements are the same DOM nodes as server-rendered (no re-creation).
