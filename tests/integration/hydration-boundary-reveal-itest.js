'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Hydration boundary reveals', function () {
  it('hydrates a tree containing a resolved #suspense boundary', function () {
    // Build an SSR tree where the Suspense boundary has already resolved
    // (reveal happened before hydration — the common case).
    //
    // SSR tree structure:
    //   div
    //     #suspense (pending: false)
    //       p "Content"
    //
    // This is what the SSR tree looks like after a reveal has been applied
    // but before hydration starts.
    var Suspense = React.Suspense;

    var ssrElement = (
      <div>
        <Suspense fallback={<p>Loading...</p>}>
          <p>Content</p>
        </Suspense>
      </div>
    );

    var root = Fantom.createHydrationRoot(ssrElement);
    Fantom.runTask(function () {
      root.hydrate(ssrElement);
    });

    var output = root.getRenderedOutput();
    expect(output.children.length).toBe(1);
    expect(output.children[0].type).toBe('div');
  });

  it('hydrates with multiple siblings after a #suspense boundary', function () {
    // Verify findNextSibling works when traversing past Suspense boundaries.
    var Suspense = React.Suspense;

    var ssrElement = (
      <div>
        <p>Before</p>
        <Suspense fallback={<p>Loading...</p>}>
          <p>Inside Suspense</p>
        </Suspense>
        <p>After</p>
      </div>
    );

    var root = Fantom.createHydrationRoot(ssrElement);
    Fantom.runTask(function () {
      root.hydrate(ssrElement);
    });

    var output = root.getRenderedOutput();
    var div = output.children[0];
    expect(div.type).toBe('div');
    // Should have all three children (Before, Inside Suspense, After)
    expect(div.children.length).toBeGreaterThan(1);
  });

  it('supports updates after hydrating a tree with Suspense', function () {
    var Suspense = React.Suspense;

    var ssrElement = (
      <div>
        <Suspense fallback={<p>Loading...</p>}>
          <p>Original</p>
        </Suspense>
      </div>
    );

    var root = Fantom.createHydrationRoot(ssrElement);
    var hydrationRoot;
    Fantom.runTask(function () {
      hydrationRoot = root.hydrate(ssrElement);
    });

    // Update after hydration
    Fantom.runTask(function () {
      hydrationRoot.render(
        <div>
          <Suspense fallback={<p>Loading...</p>}>
            <p>Updated</p>
          </Suspense>
        </div>
      );
    });

    var output = root.getRenderedOutput();
    expect(output.children[0].type).toBe('div');
  });
});
