# Hooks State Rendering: useState, useReducer, useMemo, useCallback, useRef

## Category
fizz

## Description
Validates that React hooks produce correct output during server-side rendering with Fizz. `useState` and `useReducer` render their initial state values. `useMemo` and `useCallback` compute and return values during SSR. `useRef` returns an object with a `current` property but mutations should not persist (server is stateless). `useEffect` and `useLayoutEffect` must NOT execute on the server.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (hooks in SSR tests)
- `packages/react-server/src/ReactFizzHooks.js` (server-side hook implementations)

## App Setup
```jsx
function HooksStateApp() {
  return (
    <div>
      <UseStateComponent />
      <UseReducerComponent />
      <UseMemoComponent />
      <UseCallbackComponent />
      <UseRefComponent />
      <UseEffectComponent />
    </div>
  );
}

function UseStateComponent() {
  const [count] = React.useState(42);
  const [name] = React.useState('Alice');
  const [items] = React.useState(() => ['a', 'b', 'c']); // lazy initializer
  return (
    <div id="use-state">
      <span id="state-count">{count}</span>
      <span id="state-name">{name}</span>
      <span id="state-items">{items.join(',')}</span>
    </div>
  );
}

function UseReducerComponent() {
  const reducer = (state, action) => {
    switch (action.type) {
      case 'increment': return { count: state.count + 1 };
      default: return state;
    }
  };
  const [state] = React.useReducer(reducer, { count: 10 });
  const [value] = React.useReducer(x => x, 0, init => init + 5); // with init function
  return (
    <div id="use-reducer">
      <span id="reducer-count">{state.count}</span>
      <span id="reducer-init">{value}</span>
    </div>
  );
}

function UseMemoComponent() {
  const expensive = React.useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => i * 2).join(',');
  }, []);
  return <div id="use-memo">{expensive}</div>;
}

function UseCallbackComponent() {
  const formatter = React.useCallback((name) => `Hello, ${name}!`, []);
  return <div id="use-callback">{formatter('World')}</div>;
}

function UseRefComponent() {
  const ref = React.useRef('initial');
  // During SSR, ref.current starts as 'initial' and should render that
  return <div id="use-ref">{ref.current}</div>;
}

function UseEffectComponent() {
  let effectRan = 'no';
  let layoutEffectRan = 'no';

  React.useEffect(() => {
    effectRan = 'yes'; // should NOT run on server
  }, []);

  React.useLayoutEffect(() => {
    layoutEffectRan = 'yes'; // should NOT run on server
  }, []);

  return (
    <div id="use-effect">
      <span id="effect-ran">{effectRan}</span>
      <span id="layout-effect-ran">{layoutEffectRan}</span>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<HooksStateApp />)`.

## Load Sequence
1. Server renders all components, executing hooks in order.
2. `useState` returns `[initialState, setter]` -- only initial state is used during SSR.
3. `useReducer` returns `[initialState, dispatch]` -- only initial state (possibly processed by init function) is used.
4. `useMemo` executes the factory function and returns the computed value.
5. `useCallback` returns the callback function (which can be called during render).
6. `useRef` returns `{ current: initialValue }`.
7. `useEffect` and `useLayoutEffect` callbacks are NOT executed on the server.
8. HTML is flushed and client hydrates.

## Actions
1. Server-render `<HooksStateApp />` and collect HTML output.
2. Parse the HTML and verify rendered values.
3. Hydrate with `hydrateRoot`.
4. After hydration, verify that effects now run on the client.

## Assertions
1. `#state-count` contains `42`.
2. `#state-name` contains `Alice`.
3. `#state-items` contains `a,b,c` (lazy initializer was called).
4. `#reducer-count` contains `10`.
5. `#reducer-init` contains `5` (init function `init => init + 5` was called with initial value `0`).
6. `#use-memo` contains `0,2,4,6,8`.
7. `#use-callback` contains `Hello, World!`.
8. `#use-ref` contains `initial`.
9. `#effect-ran` contains `no` (useEffect did NOT run on server).
10. `#layout-effect-ran` contains `no` (useLayoutEffect did NOT run on server).
11. Hydration completes without mismatch warnings.
12. After hydration on the client, `useEffect` callbacks fire.
