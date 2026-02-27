# User Interaction on Deferred Boundary Triggers Immediate Hydration

## Category
hydration

## Description
Validates that when a user interacts with a Suspense boundary whose hydration has been deferred (e.g., because it was suspended), React upgrades the priority of that boundary's hydration. If the boundary can be hydrated (its data is available), it hydrates synchronously in response to the interaction. If the data is not yet available, React queues the boundary for high-priority hydration once data arrives.

## References
- `packages/react-dom/src/__tests__/ReactDOMServerPartialHydration-test.internal.js` — "blocks updates to hydrate the content first if props have changed"
- `packages/react-dom/src/__tests__/ReactDOMServerSelectiveHydration-test.internal.js` — "hydrates the target boundary synchronously during a click"

## App Setup
```jsx
let suspendComments = true;
let resolveComments;
const commentsPromise = new Promise(resolve => (resolveComments = resolve));

function Comment({ id, text }) {
  return (
    <div className="comment" id={`comment-${id}`}>
      <p>{text}</p>
      <button
        id={`like-${id}`}
        onClick={() => {
          document.getElementById('interaction-log').textContent +=
            `Liked comment ${id}\n`;
        }}
      >
        Like
      </button>
    </div>
  );
}

function CommentList() {
  if (suspendComments) {
    throw commentsPromise;
  }
  return (
    <div id="comments">
      <Comment id="1" text="First comment" />
      <Comment id="2" text="Second comment" />
      <Comment id="3" text="Third comment" />
    </div>
  );
}

function Article() {
  return (
    <article id="article">
      <h1>Article Title</h1>
      <p>Article body content.</p>
    </article>
  );
}

function App() {
  return (
    <div>
      <Suspense fallback="Loading article...">
        <Article />
      </Suspense>
      <Suspense fallback="Loading comments...">
        <CommentList />
      </Suspense>
      <pre id="interaction-log"></pre>
    </div>
  );
}
```

## Load Sequence
1. Server renders all content (both article and comments).
2. Browser paints complete page.
3. Client JS loads. `suspendComments = true`.
4. `hydrateRoot(container, <App />)` is called.
5. Article boundary hydrates normally.
6. Comments boundary is deferred (suspended).
7. User clicks "Like" on comment 2 while comments are not yet hydrated.
8. React records the intent to prioritize the comments boundary.
9. `resolveComments()` is called.
10. React hydrates the comments boundary at high priority.
11. The click event fires on the "Like" button.

## Actions
1. Load the server-rendered page.
2. Wait for the article to hydrate (it is not suspended).
3. Click the "Like" button on comment 2 before the comments boundary hydrates.
4. Resolve the comments promise.
5. Wait for comments to hydrate.
6. Click the "Like" button on comment 1 to confirm interactivity.

## Assertions
1. After server render: the article and all three comments are visible.
2. After article hydration: the article section is interactive.
3. Before comments hydrate: clicking "Like" on comment 2 does not immediately fire the handler (boundary is suspended).
4. After resolving the promise: the comments boundary hydrates at elevated priority.
5. After comments hydrate: "Liked comment 2" appears in the interaction log (the event is replayed or the boundary hydrated in response to the click).
6. After clicking "Like" on comment 1: "Liked comment 1" appears in the log.
7. The comment DOM nodes are the same as server-rendered.
8. No errors or warnings.
