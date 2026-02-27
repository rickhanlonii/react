# useContext with Nested Providers, Default Values, Multiple Contexts

## Category
fizz

## Description
Validates that `useContext` works correctly during Fizz server-side rendering. Components must be able to read context values from providers in the tree, fall back to default values when no provider is present, handle nested providers that override parent values, and work with multiple independent contexts simultaneously.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (context tests)
- `packages/react-server/src/ReactFizzHooks.js` (server-side useContext)

## App Setup
```jsx
const ThemeContext = React.createContext('light');
const UserContext = React.createContext({ name: 'Anonymous', role: 'guest' });
const LocaleContext = React.createContext('en-US');

function ContextApp() {
  return (
    <ThemeContext.Provider value="dark">
      <UserContext.Provider value={{ name: 'Alice', role: 'admin' }}>
        <div>
          <ThemeDisplay />
          <UserDisplay />
          <LocaleDisplay />

          {/* Nested override */}
          <ThemeContext.Provider value="high-contrast">
            <NestedThemeDisplay />

            {/* Double nesting */}
            <ThemeContext.Provider value="solarized">
              <DeepThemeDisplay />
            </ThemeContext.Provider>
          </ThemeContext.Provider>

          {/* After nested provider, back to parent value */}
          <ThemeAfterNested />

          {/* Multiple contexts consumed in one component */}
          <MultiContextConsumer />

          {/* Locale with provider */}
          <LocaleContext.Provider value="ja-JP">
            <LocaleDisplay />
          </LocaleContext.Provider>
        </div>
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
}

function ThemeDisplay() {
  const theme = React.useContext(ThemeContext);
  return <div id="theme">{theme}</div>;
}

function UserDisplay() {
  const user = React.useContext(UserContext);
  return <div id="user">{user.name} ({user.role})</div>;
}

function LocaleDisplay() {
  const locale = React.useContext(LocaleContext);
  return <div className="locale">{locale}</div>;
}

function NestedThemeDisplay() {
  const theme = React.useContext(ThemeContext);
  return <div id="nested-theme">{theme}</div>;
}

function DeepThemeDisplay() {
  const theme = React.useContext(ThemeContext);
  return <div id="deep-theme">{theme}</div>;
}

function ThemeAfterNested() {
  const theme = React.useContext(ThemeContext);
  return <div id="after-nested-theme">{theme}</div>;
}

function MultiContextConsumer() {
  const theme = React.useContext(ThemeContext);
  const user = React.useContext(UserContext);
  const locale = React.useContext(LocaleContext);
  return (
    <div id="multi-context">
      {theme}|{user.name}|{locale}
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<ContextApp />)`.

## Load Sequence
1. Server renders the tree, maintaining a context stack.
2. As the renderer enters each `Provider`, it pushes the new value onto the context stack.
3. As it exits each `Provider`, it pops the value.
4. Components read from the current top of the context stack.
5. HTML is flushed and client hydrates.

## Actions
1. Server-render `<ContextApp />` and collect HTML output.
2. Parse the HTML and verify each component received the correct context value.
3. Hydrate with `hydrateRoot` using the same provider tree.

## Assertions
1. `#theme` contains `dark` (from the top-level ThemeContext.Provider).
2. `#user` contains `Alice (admin)` (from UserContext.Provider).
3. The first `.locale` element (outside LocaleContext.Provider) contains `en-US` (default value, no provider).
4. `#nested-theme` contains `high-contrast` (from nested ThemeContext.Provider).
5. `#deep-theme` contains `solarized` (from doubly-nested ThemeContext.Provider).
6. `#after-nested-theme` contains `dark` (back to the outer ThemeContext.Provider after nested providers close).
7. `#multi-context` contains `dark|Alice|en-US` (reads from all three contexts simultaneously).
8. The second `.locale` element (inside LocaleContext.Provider) contains `ja-JP`.
9. Hydration completes without warnings.
10. Context values remain correct after hydration.
