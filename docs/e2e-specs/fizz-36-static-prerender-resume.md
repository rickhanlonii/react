# Prerender + Resume Flow: Static Shell with Dynamic Content

## Category
fizz

## Description
Validates the prerender + resume flow where a page is split into a static shell (prerendered at build time) and dynamic content (rendered at request time). The `prerender` API can produce a static shell with postponed boundaries, and `resumeToPipeableStream` or `resumeFromReadableStream` fills in the dynamic content at serve time. This enables hybrid rendering where the shell is cached/static but personalized or time-sensitive content is rendered per-request.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzStaticBrowser-test.js` (prerender + resume tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzStatic-test.js` (static prerender with postpone)

## App Setup
```jsx
function StaticHeader() {
  return (
    <header id="header">
      <h1>My Website</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    </header>
  );
}

function DynamicGreeting({ userId }) {
  // This would be dynamic per-request
  return <div id="greeting">Hello, User #{userId}!</div>;
}

function DynamicTimestamp() {
  const now = new Date().toISOString();
  return <div id="timestamp">Generated at: {now}</div>;
}

function StaticFooter() {
  return (
    <footer id="footer">
      <p>Copyright 2024 My Website</p>
    </footer>
  );
}

function PreRenderResumeApp({ userId }) {
  return (
    <html>
      <head>
        <title>Hybrid Rendering</title>
      </head>
      <body>
        <StaticHeader />
        <main>
          <p>Static content that never changes.</p>
          <Suspense fallback={<div>Loading greeting...</div>}>
            <DynamicGreeting userId={userId} />
          </Suspense>
          <Suspense fallback={<div>Loading timestamp...</div>}>
            <DynamicTimestamp />
          </Suspense>
        </main>
        <StaticFooter />
      </body>
    </html>
  );
}
```

### Build-time prerender:
```js
import { prerender } from 'react-dom/static.browser';

// At build time, prerender with dynamic sections postponed
const { prelude, postponed } = await prerender(
  <PreRenderResumeApp userId={null} />,
  {
    // Configuration for which boundaries to postpone
  }
);

// Save prelude HTML and postponed state to disk
fs.writeFileSync('shell.html', await readStream(prelude));
fs.writeFileSync('postponed.json', JSON.stringify(postponed));
```

### Request-time resume:
```js
import { resume } from 'react-dom/server';

// At request time, load the prerendered shell and postponed state
const postponed = JSON.parse(fs.readFileSync('postponed.json'));

const stream = await resume(
  <PreRenderResumeApp userId={request.userId} />,
  postponed,
);
// Stream combines the prerendered shell with dynamic content
```

## Load Sequence
1. At build time, `prerender()` renders the static portions of the app.
2. Dynamic content inside Suspense boundaries that depend on per-request data is postponed.
3. The `prelude` contains the static shell HTML.
4. The `postponed` object encodes which boundaries need to be filled in at request time.
5. At request time, `resume()` takes the postponed state and renders only the dynamic boundaries.
6. The client receives the combined HTML: static shell + dynamic content.
7. The page can be hydrated normally.

## Actions
1. Prerender `<PreRenderResumeApp userId={null} />` at build time.
2. Save the prelude (static shell HTML) and postponed state.
3. At request time, resume with `userId=42`.
4. Collect the combined HTML output.
5. Verify it contains both static and dynamic content.
6. Hydrate on the client.

## Assertions
1. The prerender result has a non-null `postponed` field when dynamic boundaries are present.
2. The static shell HTML contains `#header` with navigation links.
3. The static shell HTML contains `#footer` with copyright text.
4. The static shell HTML contains "Static content that never changes."
5. After resume with `userId=42`, the output contains `<div id="greeting">Hello, User #42!</div>`.
6. The output contains `<div id="timestamp">Generated at: ...</div>` with a current timestamp.
7. The combined output is a complete, valid HTML document.
8. The static portions of the HTML are identical between prerender and resume.
9. The dynamic portions reflect the request-time data (userId, timestamp).
10. Hydration completes without mismatch warnings.
11. The same static shell can be reused across multiple requests with different dynamic data.
