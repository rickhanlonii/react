'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');
var renderer = require('react-dom-native/src/renderer/renderer');

// ---------------------------------------------------------------------------
// Hydration with Suspense boundaries
//
// Reproduces the App.js structure: a root div containing two sibling
// <Suspense> boundaries, each wrapping resolved async content.
//
// The SSR instruction stream produces #suspense host elements that React's
// reconciler never creates. These tests manually build SSR trees with
// #suspense nodes to match what the real SSR pipeline produces after
// boundary reveals, then run hydrateRoot to verify the hydration path.
// ---------------------------------------------------------------------------

describe('Hydration with Suspense boundaries (App.js reproduction)', function () {
  var Suspense = React.Suspense;
  var surfaceId = 1;
  var container = {surfaceId: surfaceId, width: 390, height: 844};

  // -- Helpers for building SSR tree nodes manually --

  function ssrNode(type, props) {
    return $$createNode(type, surfaceId, props || {}, false, null);
  }

  function ssrText(text) {
    return $$createTextNode(text, surfaceId, null);
  }

  function getOutput() {
    return JSON.parse($$getRenderedOutput(surfaceId));
  }

  // Register as both current visual tree and SSR tree for hydration
  function setupSSRTree(rootNodeIds) {
    $$completeRoot(surfaceId, rootNodeIds);
    $$registerSSRTree(surfaceId, rootNodeIds);
  }

  // -- Tests --

  it('hydrates a single resolved Suspense boundary', function () {
    // SSR tree (after boundary reveal):
    //   div
    //     #suspense (pending: false, boundaryId: 0)
    //       p → "Hello"

    var p = ssrNode('p');
    $$appendChild(p, ssrText('Hello'));

    var suspense = ssrNode('#suspense', {
      pending: false, fallback: false, boundaryId: 0,
    });
    $$appendChild(suspense, p);

    var rootDiv = ssrNode('div');
    $$appendChild(rootDiv, suspense);

    setupSSRTree([rootDiv]);

    // Hydrate
    var errors = [];
    Fantom.runTask(function () {
      renderer.hydrateRoot(container,
        <div>
          <Suspense fallback={<p>Loading...</p>}>
            <p>Hello</p>
          </Suspense>
        </div>,
        {
          onRecoverableError: function (err) { errors.push(err.message); },
        }
      );
    });

    // Hydration should succeed without errors
    expect(errors).toEqual([]);

    var output = getOutput();
    expect(output.children[0].type).toBe('div');
    expect(JSON.stringify(output)).toContain('Hello');
  });

  it('hydrates two sibling Suspense boundaries (App.js structure)', function () {
    // SSR tree (after both boundary reveals):
    //   div
    //     #suspense (pending: false, boundaryId: 0)
    //       div
    //         h2 → "Content A (streamed)"
    //         p  → "Content A"
    //     #suspense (pending: false, boundaryId: 1)
    //       div
    //         h2 → "Content B (streamed)"
    //         p  → "Content"

    // --- Boundary 0 content ---
    var h2_a = ssrNode('h2');
    $$appendChild(h2_a, ssrText('Content A (streamed)'));

    var p_a = ssrNode('p');
    $$appendChild(p_a, ssrText('Content A'));

    var contentDiv_a = ssrNode('div');
    $$appendChild(contentDiv_a, h2_a);
    $$appendChild(contentDiv_a, p_a);

    var suspense_a = ssrNode('#suspense', {
      pending: false, fallback: false, boundaryId: 0,
    });
    $$appendChild(suspense_a, contentDiv_a);

    // --- Boundary 1 content ---
    var h2_b = ssrNode('h2');
    $$appendChild(h2_b, ssrText('Content B (streamed)'));

    var p_b = ssrNode('p');
    $$appendChild(p_b, ssrText('Content'));

    var contentDiv_b = ssrNode('div');
    $$appendChild(contentDiv_b, h2_b);
    $$appendChild(contentDiv_b, p_b);

    var suspense_b = ssrNode('#suspense', {
      pending: false, fallback: false, boundaryId: 1,
    });
    $$appendChild(suspense_b, contentDiv_b);

    // --- Root ---
    var rootDiv = ssrNode('div');
    $$appendChild(rootDiv, suspense_a);
    $$appendChild(rootDiv, suspense_b);

    setupSSRTree([rootDiv]);

    // Hydrate with React tree matching App.js
    var errors = [];
    Fantom.runTask(function () {
      renderer.hydrateRoot(container,
        <div>
          <Suspense fallback={<p>Fallback A...</p>}>
            <div>
              <h2>Content A (streamed)</h2>
              <p>Content A</p>
            </div>
          </Suspense>
          <Suspense fallback={<p>Fallback B...</p>}>
            <div>
              <h2>Content B (streamed)</h2>
              <p>Content</p>
            </div>
          </Suspense>
        </div>,
        {
          onRecoverableError: function (err) { errors.push(err.message); },
        }
      );
    });

    // Hydration should complete without recoverable errors
    expect(errors).toEqual([]);

    // Both boundaries' content should be present
    var output = getOutput();
    var outputStr = JSON.stringify(output);
    expect(outputStr).toContain('Content A (streamed)');
    expect(outputStr).toContain('Content A');
    expect(outputStr).toContain('Content B (streamed)');
    expect(outputStr).toContain('Content');
  });

  it('updates correctly after hydrating with Suspense boundaries', function () {
    // SSR tree: div > #suspense(pending:false) > div > h2 "Original"
    var h2 = ssrNode('h2');
    $$appendChild(h2, ssrText('Original'));

    var contentDiv = ssrNode('div');
    $$appendChild(contentDiv, h2);

    var suspense = ssrNode('#suspense', {
      pending: false, fallback: false, boundaryId: 0,
    });
    $$appendChild(suspense, contentDiv);

    var rootDiv = ssrNode('div');
    $$appendChild(rootDiv, suspense);

    setupSSRTree([rootDiv]);

    // Hydrate
    var hydrationRoot;
    Fantom.runTask(function () {
      hydrationRoot = renderer.hydrateRoot(container,
        <div>
          <Suspense fallback={<p>Loading...</p>}>
            <div><h2>Original</h2></div>
          </Suspense>
        </div>,
        {
          onRecoverableError: function () {},
        }
      );
    });

    // Update content inside Suspense
    Fantom.runTask(function () {
      hydrationRoot.render(
        <div>
          <Suspense fallback={<p>Loading...</p>}>
            <div><h2>Updated</h2></div>
          </Suspense>
        </div>
      );
    });

    var output = getOutput();
    var outputStr = JSON.stringify(output);
    expect(outputStr).toContain('Updated');
    expect(outputStr).not.toContain('Original');
  });

  it('hydrates a pending Suspense boundary (not yet revealed)', function () {
    // SSR tree with pending boundary:
    //   div
    //     #suspense (pending: true, boundaryId: 0)
    //       p → "Fallback..."

    var fallbackP = ssrNode('p');
    $$appendChild(fallbackP, ssrText('Fallback...'));

    var suspense = ssrNode('#suspense', {
      pending: true, fallback: false, boundaryId: 0,
    });
    $$appendChild(suspense, fallbackP);

    var rootDiv = ssrNode('div');
    $$appendChild(rootDiv, suspense);

    setupSSRTree([rootDiv]);

    // Hydrate — boundary is pending so React should show fallback
    var errors = [];
    Fantom.runTask(function () {
      renderer.hydrateRoot(container,
        <div>
          <Suspense fallback={<p>Fallback...</p>}>
            <p>Content (not yet available)</p>
          </Suspense>
        </div>,
        {
          onRecoverableError: function (err) { errors.push(err.message); },
        }
      );
    });

    // Pending boundary hydration should not produce errors
    expect(errors).toEqual([]);

    var output = getOutput();
    expect(output.children[0].type).toBe('div');
  });

  it('fails hydration when second Suspense boundary has empty content (App.js bug reproduction)', function () {
    // Reproduces the actual hydration failure observed in the App.js.
    //
    // When the SSR stream produces two pending Suspense boundaries and
    // the second boundary's reveal fails to attach content, the SSR tree
    // ends up with:
    //   div
    //     #suspense (pending: false, boundaryId: 0) — revealed, has content
    //       div
    //         h2 → "Content A (streamed)"
    //         p  → "Content A"
    //     #suspense (pending: false, boundaryId: 1) — marked revealed but EMPTY
    //
    // React tries to hydrate inside the second #suspense but finds no
    // children, producing:
    //   "Hydration failed because the server rendered HTML didn't match the client."

    // --- Boundary 0: correctly revealed with content ---
    var h2_a = ssrNode('h2');
    $$appendChild(h2_a, ssrText('Content A (streamed)'));

    var p_a = ssrNode('p');
    $$appendChild(p_a, ssrText('Content A'));

    var contentDiv_a = ssrNode('div');
    $$appendChild(contentDiv_a, h2_a);
    $$appendChild(contentDiv_a, p_a);

    var suspense_a = ssrNode('#suspense', {
      pending: false, fallback: false, boundaryId: 0,
    });
    $$appendChild(suspense_a, contentDiv_a);

    // --- Boundary 1: revealed (pending=false) but NO content children ---
    // This is the broken state: the reveal instruction set pending=false
    // but the content nodes were not attached.
    var suspense_b = ssrNode('#suspense', {
      pending: false, fallback: false, boundaryId: 1,
    });
    // NOTE: No children appended — simulates a failed boundary reveal

    // --- Root ---
    var rootDiv = ssrNode('div');
    $$appendChild(rootDiv, suspense_a);
    $$appendChild(rootDiv, suspense_b);

    setupSSRTree([rootDiv]);

    // Hydrate with React tree that expects content in both boundaries
    var errors = [];
    Fantom.runTask(function () {
      renderer.hydrateRoot(container,
        <div>
          <Suspense fallback={<p>Fallback A...</p>}>
            <div>
              <h2>Content A (streamed)</h2>
              <p>Content A</p>
            </div>
          </Suspense>
          <Suspense fallback={<p>Fallback B...</p>}>
            <div>
              <h2>Content B (streamed)</h2>
              <p>Content</p>
            </div>
          </Suspense>
        </div>,
        {
          onRecoverableError: function (err) { errors.push(err.message); },
        }
      );
    });

    // Hydration SHOULD produce a recoverable error — the second boundary
    // has no content in the SSR tree but React expects content.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Hydration failed');
  });
});
