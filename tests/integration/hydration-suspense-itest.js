'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');
var renderer = require('react-dom-native/client');

// ---------------------------------------------------------------------------
// Hydration with Suspense boundaries
//
// Exercises the real SSR pipeline: instruction stream strings are fed through
// InstructionStreamParser → TestSSRCoordinator → ShadowTreeBuilder/BoundaryManager
// on the Swift side via $$processSSRStream. The instruction strings match what
// NativeFizzConfig.js produces for each React tree.
//
// Instruction format reference (NativeFizzConfig.js):
//   ["O","type"]  or  ["O","type",{...props}]  — open element
//   ["T","text"]                                — text node
//   ["C"]                                       — close element
//   ["O","#suspense"] ... ["C"]                 — completed boundary (inline)
//   ["B",id] ... ["/B"]                         — pending boundary (fallback)
//   ["S",id] ... ["/S"]                         — segment (streamed content)
//   ["X",id]                                    — reveal boundary
//   ["R"]                                       — root shell complete
// ---------------------------------------------------------------------------

// TODO: FantomTester times out processing SSR instruction streams with
// Suspense boundaries. Excluded from jest.config.js until root cause is fixed.
describe('Hydration with Suspense boundaries (App.js reproduction)', function () {
  var Suspense = React.Suspense;
  var surfaceId = 1;
  var container = {surfaceId: surfaceId, width: 390, height: 844};

  function getOutput() {
    return JSON.parse($$getRenderedOutput(surfaceId));
  }

  // Helper: builds a newline-delimited instruction stream from an array of
  // instruction arrays. Each instruction is JSON-serialized on its own line.
  function stream(instructions) {
    return instructions.map(function (inst) { return JSON.stringify(inst); }).join('\n');
  }

  // -- Tests --

  it('hydrates a single resolved Suspense boundary', function () {
    // Fizz output for:
    //   <div>
    //     <Suspense fallback={<p>Loading...</p>}>
    //       <p>Hello</p>
    //     </Suspense>
    //   </div>
    // Boundary resolves inline (completed boundary).
    var ssrStream = stream([
      ['O', 'div'],
        ['O', '#suspense'],
          ['O', 'p'],
            ['T', 'Hello'],
          ['C'],
        ['C'],
      ['C'],
      ['R'],
    ]);

    $$processSSRStream(surfaceId, ssrStream);

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
    // Fizz output for:
    //   <div>
    //     <Suspense fallback={...}>
    //       <div><h2>Content A (streamed)</h2><p>Content A</p></div>
    //     </Suspense>
    //     <Suspense fallback={...}>
    //       <div><h2>Content B (streamed)</h2><p>Content</p></div>
    //     </Suspense>
    //   </div>
    // Both boundaries resolve inline (completed boundaries).
    var ssrStream = stream([
      ['O', 'div'],
        ['O', '#suspense'],
          ['O', 'div'],
            ['O', 'h2'],
              ['T', 'Content A (streamed)'],
            ['C'],
            ['O', 'p'],
              ['T', 'Content A'],
            ['C'],
          ['C'],
        ['C'],
        ['O', '#suspense'],
          ['O', 'div'],
            ['O', 'h2'],
              ['T', 'Content B (streamed)'],
            ['C'],
            ['O', 'p'],
              ['T', 'Content'],
            ['C'],
          ['C'],
        ['C'],
      ['C'],
      ['R'],
    ]);

    $$processSSRStream(surfaceId, ssrStream);

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

  // TODO: Post-hydration render updates don't propagate text changes through
  // the SSR-built shadow tree. The StubView retains the original text because
  // the reconciler's clone path doesn't update node.text on SSR-originated nodes.
  it('updates correctly after hydrating with Suspense boundaries', function () {
    // Fizz output for: <div><Suspense><div><h2>Original</h2></div></Suspense></div>
    var ssrStream = stream([
      ['O', 'div'],
        ['O', '#suspense'],
          ['O', 'div'],
            ['O', 'h2'],
              ['T', 'Original'],
            ['C'],
          ['C'],
        ['C'],
      ['C'],
      ['R'],
    ]);

    $$processSSRStream(surfaceId, ssrStream);

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
    // Fizz output for a tree where the Suspense content hasn't resolved yet.
    // The boundary is pending with fallback content visible.
    //   <div>
    //     <Suspense fallback={<p>Fallback...</p>}>
    //       <p>Content (not yet available)</p>  ← still loading
    //     </Suspense>
    //   </div>
    // Fizz emits a pending boundary (B/B) with fallback inline.
    var ssrStream = stream([
      ['O', 'div'],
        ['B', 0],
          ['O', 'p'],
            ['T', 'Fallback...'],
          ['C'],
        ['/B'],
      ['C'],
      ['R'],
    ]);

    $$processSSRStream(surfaceId, ssrStream);

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

  it('hydrates two sibling streamed Suspense boundaries (B→S→X lifecycle)', function () {
    // Reproduces the streaming SSR pattern from App.js:
    //
    // The real SSR stream (from curl http://localhost:6000/ssr) produces:
    //   1. Root shell with two pending boundaries (B/B), each with fallback
    //   2. Root complete (R)
    //   3. Segment 0 with content A (S/S), then reveal boundary 0 (X)
    //   4. Segment 1 with content B (S/S), then reveal boundary 1 (X)
    //
    // Both boundaries should be successfully revealed and hydrated.

    var ssrStream = stream([
      ['O', 'div'],
        ['B', 0],
          ['O', 'p'],
            ['T', 'Fallback A...'],
          ['C'],
        ['/B'],
        ['B', 1],
          ['O', 'p'],
            ['T', 'Fallback B...'],
          ['C'],
        ['/B'],
      ['C'],
      ['R'],
      // Segment 0: content for boundary 0
      ['S', 0],
        ['O', 'div'],
          ['O', 'h2'],
            ['T', 'Content A (streamed)'],
          ['C'],
          ['O', 'p'],
            ['T', 'Content A'],
          ['C'],
        ['C'],
      ['/S'],
      ['X', 0],
      // Segment 1: content for boundary 1
      ['S', 1],
        ['O', 'div'],
          ['O', 'h2'],
            ['T', 'Content B (streamed)'],
          ['C'],
          ['O', 'p'],
            ['T', 'Content'],
          ['C'],
        ['C'],
      ['/S'],
      ['X', 1],
    ]);

    $$processSSRStream(surfaceId, ssrStream);

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

    // Hydration should succeed — both boundaries were revealed with content.
    expect(errors).toEqual([]);

    // Both boundaries' content should be present
    var output = getOutput();
    var outputStr = JSON.stringify(output);
    expect(outputStr).toContain('Content A (streamed)');
    expect(outputStr).toContain('Content B (streamed)');
  });

  it('hydrates a pending boundary after streaming reveal (B→S→X lifecycle)', function () {
    // Fizz output for a tree where one Suspense boundary is pending,
    // then its content streams in via a segment and reveal:
    //   <div>
    //     <Suspense fallback={<p>Loading...</p>}>
    //       <p>Streamed content</p>
    //     </Suspense>
    //   </div>
    //
    // Stream order:
    //   1. Root shell with pending boundary (B/B) showing fallback
    //   2. Root complete (R)
    //   3. Segment with real content (S/S)
    //   4. Reveal instruction (X) to swap fallback → content
    var ssrStream = stream([
      ['O', 'div'],
        ['B', 0],
          ['O', 'p'],
            ['T', 'Loading...'],
          ['C'],
        ['/B'],
      ['C'],
      ['R'],
      ['S', 0],
        ['O', 'p'],
          ['T', 'Streamed content'],
        ['C'],
      ['/S'],
      ['X', 0],
    ]);

    $$processSSRStream(surfaceId, ssrStream);

    // After reveal, the boundary should be revealed (pending=false) with content
    var errors = [];
    Fantom.runTask(function () {
      renderer.hydrateRoot(container,
        <div>
          <Suspense fallback={<p>Loading...</p>}>
            <p>Streamed content</p>
          </Suspense>
        </div>,
        {
          onRecoverableError: function (err) { errors.push(err.message); },
        }
      );
    });

    expect(errors).toEqual([]);

    var output = getOutput();
    var outputStr = JSON.stringify(output);
    expect(outputStr).toContain('Streamed content');
    // Fallback should have been replaced
    expect(outputStr).not.toContain('Loading...');
  });
});
