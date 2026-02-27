# Debug Channel

## Category
flight

## Description
Validates the debug channel feature of the Flight protocol, which transports development-time debugging information (owner stacks, component source locations, async I/O tracking, console log replay) through a separate stream alongside the main Flight stream. The debug channel allows DevTools and error reporting to show accurate component stacks even for Server Components, which normally execute on a different machine. The debug info travels on a dedicated writable/readable stream pair and may arrive before or after the main Flight data.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMBrowser-test.js` ("can transport debug info through a dedicated debug channel", "should fully resolve debug info when transported through a (slow) debug channel", "should resolve a cycle between debug info and the value it produces when using a debug channel")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMNode-test.js` ("can transport debug info through a separate debug channel", "can transport debug info through a slow debug channel", "should use late-arriving I/O debug info to enhance component and owner stacks when aborting a prerender")
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMEdge-test.js` ("can transport debug info through a separate debug channel", "supports async server component debug info as the element owner in DEV", "can get the component owner stacks asynchronously")

## App Setup
```jsx
// Client Component that captures the owner stack
function ClientComponent() {
  // "use client"
  const ownerStack = React.captureOwnerStack ? React.captureOwnerStack() : null;
  return <p>Hi</p>;
}

// Server Component tree
function App() {
  return (
    <Suspense fallback={null}>
      <ClientComponent />
    </Suspense>
  );
}

// Server-side: set up the debug channel
let debugReadableStreamController;
const debugReadableStream = new ReadableStream({
  start(controller) {
    debugReadableStreamController = controller;
  },
});

const rscStream = renderToReadableStream(
  <App />,
  webpackMap,
  {
    debugChannel: {
      writable: new WritableStream({
        write(chunk) {
          debugReadableStreamController.enqueue(chunk);
        },
        close() {
          debugReadableStreamController.close();
        },
      }),
    },
  }
);

// Client-side: consume with debug channel
const response = createFromReadableStream(rscStream, {
  replayConsoleLogs: true,
  debugChannel: {
    readable: debugReadableStream,
  },
});
```

## Load Sequence
1. Server renders `<App />` with `renderToReadableStream`, providing a `debugChannel.writable` stream.
2. During rendering, the server writes debug information to the debug channel:
   - Component names and source locations for each Server Component in the tree.
   - Owner stack information (which component created which).
   - Async I/O tracking info (for async Server Components, which `await` caused the delay).
   - Console log entries from Server Components (for replay on the client).
3. The main Flight stream contains the rendered output (JSX, client references).
4. The debug stream contains only debug metadata (no rendered content).
5. Client receives both streams. `createFromReadableStream` is called with `debugChannel.readable`.
6. The Flight client merges debug info from the debug channel with the main stream data.
7. When a client component renders, `React.captureOwnerStack()` returns the server component's stack.
8. The debug channel may arrive faster or slower than the main stream -- the client handles both cases.

## Actions
1. Render a Server Component tree with the debug channel enabled.
2. On the client, mount the response with `replayConsoleLogs: true` and the debug channel.
3. Inside a client component, call `React.captureOwnerStack()`.
4. Verify the owner stack includes the Server Component (`App`).
5. Test with a slow debug channel (main stream arrives first, debug info arrives later).
6. Test error scenarios: when a client component throws, the error's owner stack should include Server Components.

## Assertions
1. In DEV mode, `React.captureOwnerStack()` inside `ClientComponent` should return a stack containing `App` (the Server Component that rendered it).
2. The owner stack should include source location information (file and line number).
3. The debug channel should NOT affect the rendered output -- `<p>Hi</p>` should render correctly regardless.
4. When the debug channel is slower than the main stream, the client should wait for debug info before resolving component stacks (no "Connection closed" errors).
5. Console logs from Server Components should be replayed on the client when `replayConsoleLogs: true`.
6. Async Server Component debug info should include I/O tracking (identifying which `await` caused the async boundary).
7. The debug channel should work with both W3C streams (browser) and Node.js streams.
8. Debug info should survive the full pipeline: Flight server -> debug channel -> Flight client -> Fizz SSR -> client hydration.
9. Cyclic references between debug info and the values they describe should be resolved correctly.
10. Static children with keys should not produce missing key warnings when blocked on debug info delivery.
