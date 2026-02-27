# Streaming with Progressive Hydration

## Category
integration

## Description
Validates that Fizz streaming with multiple Suspense boundaries produces a progressively-rendered page where the shell renders immediately, deferred Suspense boundaries stream in as their data resolves, and each boundary hydrates independently on the client. This tests the coordination between server-side streaming (out-of-order completion of Suspense boundaries) and client-side selective hydration (React prioritizes hydrating boundaries the user interacts with). This is the core architectural pattern for high-performance SSR applications.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` - Fizz tests with streaming Suspense boundaries and deferred content
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` - Shell hydration and deferred boundary tests
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` - Selective hydration priority tests
- `fixtures/ssr2/src/App.js` - SSR2 fixture with multiple nested Suspense boundaries (Sidebar, Post, Comments)
- `fixtures/ssr2/server/render.js` - Server rendering with data fetching delays

## App Setup
```jsx
// Server: server.js
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

function handleRequest(req, res) {
  let didError = false;
  const { pipe, abort } = renderToPipeableStream(<App />, {
    bootstrapScripts: ['/client.js'],
    onShellReady() {
      res.statusCode = didError ? 500 : 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },
    onError(error) {
      didError = true;
      console.error(error);
    },
  });
  setTimeout(() => abort(), 10000);
}

// Client: client.js
import { hydrateRoot } from 'react-dom/client';
import App from './App';

hydrateRoot(document, <App />);

// Shared: App.js
import { Suspense, useState } from 'react';

// Simulates async data fetching that resolves at different times
function createResource(value, delay) {
  let status = 'pending';
  let result;
  const promise = new Promise(resolve => {
    setTimeout(() => {
      status = 'resolved';
      result = value;
      resolve(value);
    }, delay);
  });
  return {
    read() {
      if (status === 'pending') throw promise;
      return result;
    },
  };
}

const navData = createResource('Navigation loaded', 100);
const sidebarData = createResource('Sidebar loaded', 500);
const commentsData = createResource('Comments loaded', 1500);

function NavBar() {
  const data = navData.read();
  const [expanded, setExpanded] = useState(false);
  return (
    <nav id="nav">
      <span>{data}</span>
      <button id="nav-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </nav>
  );
}

function Sidebar() {
  const data = sidebarData.read();
  const [selected, setSelected] = useState(null);
  return (
    <aside id="sidebar">
      <p>{data}</p>
      <ul>
        <li>
          <button id="sidebar-item" onClick={() => setSelected('A')}>
            Item A
          </button>
        </li>
      </ul>
      {selected && <p id="sidebar-selected">Selected: {selected}</p>}
    </aside>
  );
}

function Comments() {
  const data = commentsData.read();
  return (
    <section id="comments">
      <p>{data}</p>
      <div>Comment 1: Great article!</div>
      <div>Comment 2: Thanks for sharing.</div>
    </section>
  );
}

function Spinner({ label }) {
  return <div className="spinner">Loading {label}...</div>;
}

export default function App() {
  return (
    <html>
      <head><title>Streaming Test</title></head>
      <body>
        <h1>My App</h1>
        <Suspense fallback={<Spinner label="navigation" />}>
          <NavBar />
        </Suspense>
        <div id="main-content">
          <article>
            <h2>Main Article</h2>
            <p>This is the main content that renders immediately in the shell.</p>
          </article>
          <Suspense fallback={<Spinner label="sidebar" />}>
            <Sidebar />
          </Suspense>
          <Suspense fallback={<Spinner label="comments" />}>
            <Comments />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request to the server.
2. Server calls `renderToPipeableStream(<App />)` and begins rendering the component tree.
3. The shell (everything outside Suspense boundaries) renders immediately: `<h1>My App</h1>`, the `<article>` with main content, and Suspense fallback spinners for NavBar, Sidebar, and Comments.
4. `onShellReady` fires and the server begins streaming the shell HTML to the client.
5. The browser receives and displays the shell: the heading, article content, and three "Loading..." spinners.
6. After ~100ms, the NavBar data resolves on the server. Fizz generates a `<template>` block containing the NavBar HTML and a `<script>` to swap it into the correct Suspense boundary's fallback slot. This chunk is streamed to the client.
7. The browser receives the chunk, the Fizz runtime script executes, and the NavBar spinner is replaced with the actual NavBar content.
8. After ~500ms, the Sidebar data resolves. Same streaming replacement process occurs.
9. After ~1500ms, the Comments data resolves. Same streaming replacement process occurs.
10. Meanwhile, the client JavaScript bundle downloads and `hydrateRoot` is called.
11. React begins hydrating the shell and any already-revealed Suspense boundaries.
12. As each boundary streams in, React hydrates it independently. Boundaries that the user has interacted with are prioritized for hydration.

## Actions
1. Navigate to the page URL.
2. Observe the initial shell render: heading, article, and three loading spinners should be visible.
3. Wait for the NavBar to stream in (~100ms) and verify the spinner is replaced.
4. Before the Sidebar streams in, click the NavBar "Expand" button to test that the NavBar has hydrated and is interactive.
5. Wait for the Sidebar to stream in (~500ms) and verify the spinner is replaced.
6. Click "Item A" in the Sidebar to verify it has hydrated.
7. Wait for the Comments to stream in (~1500ms) and verify the spinner is replaced.
8. Verify all three sections are now visible and interactive.

## Assertions
1. Initial shell render: the `<h1>My App</h1>` and `<article>` content are visible immediately, along with three Suspense fallback spinners.
2. After NavBar streams in: the navigation section `#nav` appears with "Navigation loaded" text, and the spinner for navigation is no longer visible.
3. While NavBar is streamed but Sidebar/Comments are pending: the Sidebar and Comments spinners remain visible.
4. After hydration of NavBar: clicking "Expand" button toggles its text to "Collapse" (proves event handlers are attached).
5. After Sidebar streams in: the `#sidebar` element appears with "Sidebar loaded" text.
6. After hydration of Sidebar: clicking "Item A" shows "Selected: A" text in the sidebar.
7. After Comments stream in: the `#comments` section appears with "Comments loaded" and the comment content.
8. Each boundary streams in independently and in the order its data resolves, not in DOM order.
9. No hydration mismatch errors appear in the console at any point.
10. The page is fully interactive after all boundaries have streamed in and hydrated.
