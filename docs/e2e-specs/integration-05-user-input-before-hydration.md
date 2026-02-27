# User Input Before Hydration (Input Preservation and Event Replay)

## Category
integration

## Description
Validates that when a user interacts with the server-rendered HTML before React has finished hydrating, their input is preserved and events are replayed correctly after hydration completes. This covers the critical UX scenario where a page is server-rendered with form fields, the user starts typing before JavaScript loads, and React must not discard their input during hydration. React achieves this through selective hydration (prioritizing the Suspense boundary containing the user interaction) and event replay (queuing discrete events like clicks and keystrokes and replaying them after hydration).

## References
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` - Selective hydration triggered by click events, keyboard events, and focus; event replay after hydration
- `packages/react-dom/src/__tests__/ReactDOMFizzShellHydration-test.js` - Hydration with pre-existing DOM state
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` - Fizz streaming with interactive elements

## App Setup
```jsx
// Server: server.js
import { renderToPipeableStream } from 'react-dom/server';
import App from './App';

function handleRequest(req, res) {
  const { pipe } = renderToPipeableStream(<App />, {
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
import App from './App';

// Simulate delayed hydration (e.g., large JS bundle)
// In a real scenario this delay comes from bundle download time
hydrateRoot(document, <App />);

// Shared: App.js
import { useState, Suspense } from 'react';

function SearchBox() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(null);

  return (
    <div id="search-section">
      <input
        id="search-input"
        type="text"
        placeholder="Search..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <button
        id="search-btn"
        onClick={() => setSubmitted(query)}
      >
        Search
      </button>
      {submitted && <p id="search-result">Results for: {submitted}</p>}
    </div>
  );
}

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  if (loggedIn) {
    return <div id="welcome">Welcome, {username}!</div>;
  }

  return (
    <form id="login-form" onSubmit={e => {
      e.preventDefault();
      if (username && password) setLoggedIn(true);
    }}>
      <div>
        <label htmlFor="username">Username:</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password">Password:</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>
      <button id="login-btn" type="submit">Log In</button>
    </form>
  );
}

function HeavyContent() {
  // Simulates slow data loading that delays hydration of this boundary
  const data = slowResource.read();
  return <div id="heavy-content">{data}</div>;
}

export default function App() {
  return (
    <html>
      <head><title>Input Preservation Test</title></head>
      <body>
        <h1>Input Before Hydration</h1>
        <SearchBox />
        <LoginForm />
        <Suspense fallback={<p>Loading heavy content...</p>}>
          <HeavyContent />
        </Suspense>
      </body>
    </html>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request to the server.
2. Server renders the full HTML including the search input, login form, and a Suspense fallback for HeavyContent.
3. The server streams the HTML with empty `value` attributes on inputs (matching `useState('')`).
4. The browser renders the static HTML. All inputs are visible and editable as native HTML form elements, even without JavaScript.
5. The user begins typing into the search input and username field BEFORE the client JavaScript has loaded.
6. The browser natively updates the input DOM elements' values as the user types (this is standard HTML behavior, no React needed).
7. The client JavaScript bundle downloads and `hydrateRoot` is called.
8. React begins hydration. It encounters the `<input id="search-input">` element whose DOM `.value` is now "hello" (user-typed), but the React state is `''`.
9. React's hydration preserves the DOM element (does not recreate it) and the native input value remains intact.
10. After hydration, React attaches event handlers. The `onChange` handler is now active.
11. Any queued discrete events (like clicks) are replayed after hydration.

## Actions
1. Navigate to the page URL and wait for server-rendered HTML to appear.
2. BEFORE hydration completes: type "hello" into the search input (`#search-input`).
3. BEFORE hydration completes: type "admin" into the username field (`#username`).
4. BEFORE hydration completes: type "secret" into the password field (`#password`).
5. BEFORE hydration completes: click the "Search" button (`#search-btn`).
6. Wait for hydration to complete.
7. Verify the input values are preserved after hydration.
8. After hydration: type additional characters " world" into the search input (making it "hello world").
9. Click the "Search" button again.
10. Fill in login form and click "Log In".

## Assertions
1. Before hydration: the server-rendered HTML contains `<input id="search-input">` with `placeholder="Search..."`.
2. Before hydration: the user can type into inputs because they are native HTML elements.
3. After hydration: the `#search-input` element retains the user-typed value "hello" -- React does not clear or reset it.
4. After hydration: the `#username` input retains the user-typed value "admin".
5. After hydration: the `#password` input retains the user-typed value "secret".
6. After hydration: the DOM elements are the SAME nodes (not recreated), verified by comparing references before and after hydration.
7. The click on "Search" that happened before hydration is replayed after hydration, causing `setSubmitted('hello')` to execute and `<p id="search-result">Results for: hello</p>` to appear.
8. After typing " world" post-hydration: the search input shows "hello world" and React's `onChange` handler fires, updating the `query` state.
9. Clicking "Search" again after hydration: `<p id="search-result">` updates to "Results for: hello world".
10. After submitting the login form: `<div id="welcome">Welcome, admin!</div>` appears, proving form state was preserved through hydration.
11. No hydration mismatch warnings appear (the pre-typed text does not cause a mismatch because React preserves the existing DOM values for controlled inputs).
