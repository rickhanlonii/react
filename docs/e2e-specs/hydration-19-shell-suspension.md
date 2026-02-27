# Shell Suspension During Hydration

## Category
hydration

## Description
Validates the behavior when the entire shell of the application suspends during hydration. Unlike Suspense boundaries within the page, shell suspension means the top-level content cannot hydrate because its data is not yet available on the client. During shell suspension, the server-rendered HTML remains visible, refs are not yet attached, and the app is not interactive. Once the data resolves, hydration completes and the app becomes interactive with the same DOM nodes.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` — "suspending in the shell during hydration"

## App Setup
```jsx
const textCache = new Map();

function readText(text) {
  const record = textCache.get(text);
  if (record !== undefined) {
    if (record.status === 'pending') throw record.promise;
    if (record.status === 'resolved') return record.value;
  }
  const promise = new Promise(resolve => {
    const newRecord = { status: 'pending', promise: null, value: null };
    newRecord.promise = promise;
    newRecord.resolve = () => {
      newRecord.status = 'resolved';
      newRecord.value = text;
      resolve();
    };
    textCache.set(text, newRecord);
  });
  throw promise;
}

function resolveText(text) {
  const record = textCache.get(text);
  if (record && record.status === 'pending') {
    record.resolve();
  }
}

function ShellContent() {
  const data = readText('Shell');
  const divRef = React.useRef(null);
  return (
    <div id="shell" ref={divRef}>
      <h1>{data}</h1>
      <p id="shell-detail">Application shell loaded</p>
    </div>
  );
}

function App() {
  return <ShellContent />;
}
```

On the server, `resolveText('Shell')` is called before rendering so the data is available. On the client, the text cache is empty, so `readText('Shell')` suspends.

## Load Sequence
1. Server: `resolveText('Shell')` is called, then `renderToPipeableStream(<App />)` produces complete HTML.
2. Browser paints: "Shell" heading and "Application shell loaded" are visible.
3. Client JS loads. Text cache is cleared (empty).
4. `hydrateRoot(container, <App />)` is called.
5. `readText('Shell')` throws a promise — the shell suspends.
6. Server-rendered HTML stays visible. Refs are not attached (`divRef.current === null`).
7. `resolveText('Shell')` is called on the client.
8. Hydration resumes and completes.
9. Refs are attached to the server-rendered DOM nodes.

## Actions
1. Load the server-rendered page.
2. Observe the server-rendered content is visible.
3. Before resolving the shell data, verify the app is not yet hydrated (refs are null, not interactive).
4. Resolve the shell data.
5. Wait for hydration to complete.
6. Verify the app is now interactive and refs are attached.

## Assertions
1. After server render: "Shell" and "Application shell loaded" are visible.
2. During shell suspension: the server-rendered HTML persists (it is NOT replaced by a loading state).
3. During shell suspension: `divRef.current` is `null` (not yet attached).
4. During shell suspension: the `<div id="shell">` DOM node exists (server-rendered).
5. After resolving the data: hydration completes successfully.
6. After hydration: `divRef.current` is the same `<div id="shell">` DOM node that was server-rendered.
7. After hydration: `container.textContent` includes "Shell" and "Application shell loaded".
8. No hydration errors or warnings.
