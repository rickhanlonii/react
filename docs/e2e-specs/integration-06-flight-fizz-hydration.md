# Flight to Fizz to Client Hydration (Full RSC Flow)

## Category
integration

## Description
Validates the complete React Server Components (RSC) pipeline: Server Components render on the RSC server via the Flight protocol (`renderToPipeableStream` from `react-server-dom-webpack/server`), the Flight output is consumed by an SSR server that uses Fizz (`renderToPipeableStream` from `react-dom/server`) to generate HTML, and the client hydrates the result using `hydrateRoot` with the Flight response providing the component tree. This three-phase flow (Flight render -> Fizz SSR -> Client hydration) is the canonical RSC architecture. Server Components never ship to the client bundle, Client Components are referenced by module ID and hydrated on the client.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOM-test.js` - Full Flight -> client rendering flow including `renderToPipeableStream` (Flight), `createFromReadableStream`, `ReactDOMFizzServer.renderToPipeableStream` for SSR, and `hydrateRoot`
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` - Flight -> Fizz SSR -> hydration flow for forms
- `fixtures/flight/` - Flight fixture app

## App Setup
```jsx
// RSC Server (react-server condition): rsc-server.js
import { renderToPipeableStream } from 'react-server-dom-webpack/server';
import App from './App.server';

function handleRSCRequest(req, res) {
  const { pipe } = renderToPipeableStream(<App />, webpackMap);
  pipe(res);
}

// App.server.js (Server Component - never sent to client)
import ClientCounter from './ClientCounter'; // 'use client'
import ClientNav from './ClientNav';         // 'use client'

async function ServerGreeting() {
  // Server Components can do async work directly
  const greeting = await fetchGreeting(); // e.g., database call
  return <h1 id="greeting">{greeting}</h1>;
}

function ServerLayout({ children }) {
  // Server Components can render Client Components as children
  return (
    <div id="layout">
      <ClientNav items={['Home', 'About', 'Contact']} />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <ServerLayout>
      <ServerGreeting />
      <section id="counter-section">
        <h2>Interactive Counter</h2>
        <ClientCounter initialCount={42} />
      </section>
      <section id="server-data">
        <h2>Server-Only Data</h2>
        <p>Database record ID: {process.env.RECORD_ID || 'abc-123'}</p>
        <p>Rendered at: {new Date().toISOString()}</p>
      </section>
    </ServerLayout>
  );
}

// ClientCounter.js ('use client')
'use client';
import { useState } from 'react';

export default function ClientCounter({ initialCount }) {
  const [count, setCount] = useState(initialCount);
  return (
    <div id="counter">
      <p id="count-display">Count: {count}</p>
      <button id="decrement" onClick={() => setCount(c => c - 1)}>-</button>
      <button id="increment" onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}

// ClientNav.js ('use client')
'use client';
import { useState } from 'react';

export default function ClientNav({ items }) {
  const [active, setActive] = useState(items[0]);
  return (
    <nav id="nav">
      {items.map(item => (
        <button
          key={item}
          className={active === item ? 'active' : ''}
          onClick={() => setActive(item)}
        >
          {item}
        </button>
      ))}
      <span id="active-page">Current: {active}</span>
    </nav>
  );
}

// SSR Server: ssr-server.js
import { renderToPipeableStream } from 'react-dom/server';
import { createFromNodeStream } from 'react-server-dom-webpack/client';

function handleSSRRequest(req, res) {
  // 1. Fetch the Flight stream from the RSC server
  const flightResponse = fetch('http://rsc-server/rsc');

  // 2. Decode the Flight stream into a React element tree
  const flightStream = flightResponse.body;
  const reactTree = createFromNodeStream(flightStream, {
    moduleMap: ssrModuleMap,
    moduleLoading: ssrModuleLoading,
  });

  // 3. Render the React tree to HTML using Fizz
  const { pipe } = renderToPipeableStream(reactTree, {
    bootstrapScripts: ['/client.js'],
    onShellReady() {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },
  });
}

// Client: client.js
import { hydrateRoot } from 'react-dom/client';
import { createFromFetch } from 'react-server-dom-webpack/client';

// Fetch the Flight stream for hydration
const flightResponse = createFromFetch(fetch('/rsc'));

function App() {
  return use(flightResponse);
}

hydrateRoot(document, <App />);
```

## Load Sequence
1. Client sends HTTP GET request to the SSR server.
2. SSR server requests the Flight stream from the RSC server.
3. RSC server renders `<App />` (Server Component tree) using `renderToPipeableStream` from `react-server-dom-webpack/server`. This executes `ServerGreeting` (async), `ServerLayout`, and serializes references to `ClientCounter` and `ClientNav` (Client Components) as module references in the Flight protocol.
4. The Flight stream is piped to the SSR server. It contains: serialized Server Component output (HTML-like element descriptors), Client Component module references with their props (`initialCount: 42`, `items: ['Home', 'About', 'Contact']`).
5. SSR server calls `createFromNodeStream` to decode the Flight stream into a React element tree.
6. SSR server passes this element tree to Fizz's `renderToPipeableStream`. Fizz resolves Client Component references to their actual modules (loaded via the SSR module map) and renders them to HTML.
7. Fizz generates complete HTML including: the server greeting, the nav with items, the counter showing "Count: 42", and the server-only data section.
8. The HTML is streamed to the browser.
9. The browser renders the HTML immediately.
10. The client JavaScript bundle loads. It fetches a fresh Flight stream from `/rsc` for the component tree (or uses an inlined Flight payload).
11. `hydrateRoot` is called. React hydrates the page, attaching event handlers to `ClientCounter` and `ClientNav`. Server Components are not included in the client bundle.

## Actions
1. Navigate to the page and verify the full HTML renders with all content.
2. Check that Server Component output is present in the HTML (greeting, server data section with database record ID and timestamp).
3. Wait for hydration to complete.
4. Click the "+" button on the counter.
5. Click the "About" navigation button.
6. Verify that Server Component data is still displayed (it was serialized by Flight, not re-fetched).

## Assertions
1. The server-rendered HTML contains `<h1 id="greeting">` with the fetched greeting text.
2. The server-rendered HTML contains `<div id="counter">` with `<p id="count-display">Count: 42</p>`.
3. The server-rendered HTML contains `<nav id="nav">` with three buttons (Home, About, Contact) and `<span id="active-page">Current: Home</span>`.
4. The server-rendered HTML contains `<section id="server-data">` with "Database record ID: abc-123" -- proving Server Component code ran on the server.
5. After hydration: no console errors or hydration mismatch warnings.
6. After clicking "+": the count display updates to "Count: 43" -- proving the Client Component hydrated correctly with the server-provided `initialCount` prop.
7. After clicking "About": the nav updates to show `Current: About` and the "About" button gets the `active` class -- proving the Client Component's `useState` and `onClick` are functional.
8. The `ServerGreeting` and `ServerLayout` components are NOT present in the client JavaScript bundle (they are Server Components).
9. The client bundle contains only `ClientCounter` and `ClientNav` modules.
10. The server-only data (database record ID, timestamp) remains displayed unchanged after hydration and client interactions -- it was rendered by Server Components and serialized into the Flight payload.
