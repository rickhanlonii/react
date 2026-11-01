let React;
let ReactNoop;
let Scheduler;
let act;
let waitFor;
let waitForAll;
let waitForMicrotasks;
let assertLog;
let assertConsoleErrorDev;
let waitForPaint;
let Suspense;
let startTransition;
let getCacheForType;
let use;
let createStore;

let caches;
let seededCache;

describe('ReactSuspenseWithNoopRenderer', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    Suspense = React.Suspense;
    startTransition = React.startTransition;
    const InternalTestUtils = require('internal-test-utils');
    waitFor = InternalTestUtils.waitFor;
    waitForAll = InternalTestUtils.waitForAll;
    waitForPaint = InternalTestUtils.waitForPaint;
    assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;
    waitForMicrotasks = InternalTestUtils.waitForMicrotasks;
    assertLog = InternalTestUtils.assertLog;

    getCacheForType = React.unstable_getCacheForType;
    use = React.use;
    createStore = React.unstable_createStore;

    caches = [];
    seededCache = null;
  });

  function createTextCache() {
    if (seededCache !== null) {
      // Trick to seed a cache before it exists.
      // TODO: Need a built-in API to seed data before the initial render (i.e.
      // not a refresh because nothing has mounted yet).
      const cache = seededCache;
      seededCache = null;
      return cache;
    }

    const data = new Map();
    const version = caches.length + 1;
    const cache = {
      version,
      data,
      resolve(text) {
        const record = data.get(text);
        if (record === undefined) {
          const newRecord = {
            status: 'resolved',
            value: text,
          };
          data.set(text, newRecord);
        } else if (record.status === 'pending') {
          const thenable = record.value;
          record.status = 'resolved';
          record.value = text;
          thenable.pings.forEach(t => t());
        }
      },
      reject(text, error) {
        const record = data.get(text);
        if (record === undefined) {
          const newRecord = {
            status: 'rejected',
            value: error,
          };
          data.set(text, newRecord);
        } else if (record.status === 'pending') {
          const thenable = record.value;
          record.status = 'rejected';
          record.value = error;
          thenable.pings.forEach(t => t());
        }
      },
    };
    caches.push(cache);
    return cache;
  }

  function readText(text) {
    const textCache = getCacheForType(createTextCache);
    const record = textCache.data.get(text);
    if (record !== undefined) {
      switch (record.status) {
        case 'pending':
          Scheduler.log(`Suspend! [${text}]`);
          throw record.value;
        case 'rejected':
          Scheduler.log(`Error! [${text}]`);
          throw record.value;
        case 'resolved':
          return textCache.version;
      }
    } else {
      Scheduler.log(`Suspend! [${text}]`);

      const thenable = {
        pings: [],
        then(resolve) {
          if (newRecord.status === 'pending') {
            thenable.pings.push(resolve);
          } else {
            Promise.resolve().then(() => resolve(newRecord.value));
          }
        },
      };

      const newRecord = {
        status: 'pending',
        value: thenable,
      };
      textCache.data.set(text, newRecord);

      throw thenable;
    }
  }

  function Text({text}) {
    Scheduler.log(text);
    return <span prop={text} />;
  }

  function AsyncText({text, showVersion}) {
    const version = readText(text);
    const fullText = showVersion ? `${text} [v${version}]` : text;
    Scheduler.log(fullText);
    return <span prop={fullText} />;
  }

  function seedNextTextCache(text) {
    if (seededCache === null) {
      seededCache = createTextCache();
    }
    seededCache.resolve(text);
  }

  function resolveMostRecentTextCache(text) {
    if (caches.length === 0) {
      throw Error('Cache does not exist.');
    } else {
      // Resolve the most recently created cache. An older cache can by
      // resolved with `caches[index].resolve(text)`.
      caches[caches.length - 1].resolve(text);
    }
  }

  const resolveText = resolveMostRecentTextCache;

  function advanceTimers(ms) {
    // Note: This advances Jest's virtual time but not React's. Use
    // ReactNoop.expire for that.
    if (typeof ms !== 'number') {
      throw new Error('Must specify ms');
    }
    jest.advanceTimersByTime(ms);
    // Wait until the end of the current tick
    // We cannot use a timer since we're faking them
    return Promise.resolve().then(() => {});
  }

  // @gate enableStore && (enableLegacyCache)
  it('can update at a higher priority while in a suspended state', async () => {
    const highPriStore = createStore('A');
    const setHighPri = highPriStore.update;
    function HighPri() {
      const text = use(highPriStore);
      return <Text text={text} />;
    }

    const lowPriStore = createStore('1');
    const setLowPri = lowPriStore.update;
    function LowPri() {
      const text = use(lowPriStore);
      return <AsyncText text={text} />;
    }

    function App() {
      return (
        <>
          <HighPri />
          <Suspense fallback={<Text text="Loading..." />}>
            <LowPri />
          </Suspense>
        </>
      );
    }

    // Initial mount
    await act(() => ReactNoop.render(<App />));
    assertLog([
      'A',
      'Suspend! [1]',
      'Loading...',
      // pre-warming
      'Suspend! [1]',
    ]);

    await act(() => resolveText('1'));
    assertLog(['1']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span prop="A" />
        <span prop="1" />
      </>,
    );

    // Update the low-pri text
    await act(() => startTransition(() => setLowPri('2')));
    // Suspends
    assertLog(['Suspend! [2]', 'Loading...']);

    // While we're still waiting for the low-pri update to complete, update the
    // high-pri text at high priority.
    ReactNoop.flushSync(() => {
      setHighPri('B');
    });
    assertLog(['B']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span prop="B" />
        <span prop="1" />
      </>,
    );

    // Unblock the low-pri text and finish. Nothing in the UI changes because
    // the update was overriden
    await act(() => resolveText('2'));
    assertLog(['2']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span prop="B" />
        <span prop="2" />
      </>,
    );
  });

  describe('legacy mode mode', () => {
    // @gate enableStore && (enableLegacyCache && !disableLegacyMode)
    it('does not infinite loop if fallback contains lifecycle method', async () => {
      const nameStore = createStore('foo');
      function Fallback() {
        use(nameStore);
        React.useLayoutEffect(() => {
          nameStore.update('bar');
        }, []);
        return <Text text="Loading..." />;
      }

      class Demo extends React.Component {
        render() {
          return (
            <Suspense fallback={<Fallback />}>
              <AsyncText text="Hi" />
            </Suspense>
          );
        }
      }

      ReactNoop.renderLegacySyncRoot(<Demo />);

      assertLog([
        'Suspend! [Hi]',
        'Loading...',
        // Re-render due to lifecycle update
        'Loading...',
      ]);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Loading..." />);
      await act(() => {
        resolveText('Hi');
      });
      assertLog(['Hi']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Hi" />);
    });

    if (global.__PERSISTENT__) {
    } else {
    }

    // @gate enableStore && (!disableLegacyMode)
    it('does not drop mounted effects', async () => {
      const never = {then() {}};

      const shouldSuspendStore = createStore(0);
      const setShouldSuspend = shouldSuspendStore.update;
      function App() {
        const shouldSuspend = use(shouldSuspendStore);
        return (
          <Suspense fallback="Loading...">
            <Child shouldSuspend={shouldSuspend} />
          </Suspense>
        );
      }

      function Child({shouldSuspend}) {
        if (shouldSuspend) {
          throw never;
        }

        React.useEffect(() => {
          Scheduler.log('Mount');
          return () => {
            Scheduler.log('Unmount');
          };
        }, []);

        return 'Child';
      }

      const root = ReactNoop.createLegacyRoot(null);
      await act(() => {
        root.render(<App />);
      });
      assertLog(['Mount']);
      expect(root).toMatchRenderedOutput('Child');

      // Suspend the child. This puts it into an inconsistent state.
      await act(() => {
        setShouldSuspend(true);
      });
      expect(root).toMatchRenderedOutput('Loading...');

      // Unmount everything
      await act(() => {
        root.render(null);
      });
      assertLog(['Unmount']);
    });
  });

  describe('startTransition', () => {
    // @gate enableStore && (enableLegacyCache)
    it('hooks', async () => {
      const pageStore = createStore('none');
      const transitionToPage = pageStore.update;
      function App() {
        const page = use(pageStore);
        if (page === 'none') {
          return null;
        }
        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <AsyncText text={page} />
          </Suspense>
        );
      }

      ReactNoop.render(<App />);
      await waitForAll([]);

      // Initial render.
      await act(async () => {
        React.startTransition(() => transitionToPage('A'));

        await waitForAll([
          'Suspend! [A]',
          'Loading...',
          // pre-warming
          'Suspend! [A]',
        ]);
        // Only a short time is needed to unsuspend the initial loading state.
        Scheduler.unstable_advanceTime(400);
        await advanceTimers(400);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Loading..." />);
      });

      // Later we load the data.
      await act(() => resolveText('A'));
      assertLog(['A']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="A" />);

      // Start transition.
      await act(async () => {
        React.startTransition(() => transitionToPage('B'));

        await waitForAll(['Suspend! [B]', 'Loading...']);
        Scheduler.unstable_advanceTime(100000);
        await advanceTimers(100000);
        // Even after lots of time has passed, we have still not yet flushed the
        // loading state.
        expect(ReactNoop).toMatchRenderedOutput(<span prop="A" />);
      });
      // Later we load the data.
      await act(() => resolveText('B'));
      assertLog(['B']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="B" />);
    });
  });

  // @gate enableStore && (enableLegacyCache)
  it(
    'multiple updates originating inside a Suspense boundary at different ' +
      'priority levels are not dropped',
    async () => {
      const root = ReactNoop.createRoot();

      function Parent() {
        return (
          <>
            <Suspense fallback={<Text text="Loading..." />}>
              <Child />
            </Suspense>
          </>
        );
      }

      const textStore = createStore('A');
      const setText = textStore.update;
      function Child() {
        const text = use(textStore);
        return <AsyncText text={text} />;
      }

      await seedNextTextCache('A');
      await act(() => {
        root.render(<Parent />);
      });
      assertLog(['A']);
      expect(root).toMatchRenderedOutput(<span prop="A" />);

      await act(async () => {
        // Schedule two updates that originate inside the Suspense boundary.
        // The first one causes the boundary to suspend. The second one is at
        // lower priority and unsuspends the tree.
        ReactNoop.discreteUpdates(() => {
          setText('B');
        });
        startTransition(() => {
          setText('C');
        });
        // Assert that neither update has happened yet. Both the high pri and
        // low pri updates are in the queue.
        assertLog([]);

        // Resolve this before starting to render so that C doesn't suspend.
        await resolveText('C');
      });
      assertLog([
        // First we attempt the high pri update. It suspends.
        'Suspend! [B]',
        'Loading...',
        // Then we attempt the low pri update, which finishes successfully.
        'C',
      ]);
      expect(root).toMatchRenderedOutput(<span prop="C" />);
    },
  );

  // @gate enableStore && (enableLegacyCache)
  it(
    'fallback component can update itself even after a high pri update to ' +
      'the primary tree suspends',
    async () => {
      const root = ReactNoop.createRoot();

      const appTextStore = createStore('A');
      const setAppText = appTextStore.update;
      function App() {
        const text = use(appTextStore);
        return (
          <>
            <Suspense fallback={<Fallback />}>
              <AsyncText text={text} />
            </Suspense>
          </>
        );
      }

      const fallbackTextStore = createStore('Loading...');
      const setFallbackText = fallbackTextStore.update;
      function Fallback() {
        const text = use(fallbackTextStore);
        return <Text text={text} />;
      }

      // Resolve the initial tree
      await seedNextTextCache('A');
      await act(() => {
        root.render(<App />);
      });
      assertLog(['A']);
      expect(root).toMatchRenderedOutput(<span prop="A" />);

      await act(async () => {
        // Schedule an update inside the Suspense boundary that suspends.
        setAppText('B');
        await waitForAll([
          'Suspend! [B]',
          'Loading...',
          // pre-warming
          'Suspend! [B]',
        ]);
      });

      expect(root).toMatchRenderedOutput(
        <>
          <span hidden={true} prop="A" />
          <span prop="Loading..." />
        </>,
      );

      // Schedule a default pri update on the boundary, and a lower pri update
      // on the fallback. We're testing to make sure the fallback can still
      // update even though the primary tree is suspended.
      await act(() => {
        setAppText('C');
        React.startTransition(() => {
          setFallbackText('Still loading...');
        });
      });

      assertLog([
        // First try to render the high pri update. Still suspended.
        'Suspend! [C]',
        'Loading...',

        // In the expiration times model, once the high pri update suspends,
        // we can't be sure if there's additional work at a lower priority
        // that might unblock the tree. We do know that there's a lower
        // priority update *somewhere* in the entire root, though (the update
        // to the fallback). So we try rendering one more time, just in case.
        // TODO: We shouldn't need to do this with lanes, because we always
        // know exactly which lanes have pending work in each tree.
        'Suspend! [C]',

        // Then complete the update to the fallback.
        'Still loading...',
        'Suspend! [C]',
      ]);
      expect(root).toMatchRenderedOutput(
        <>
          <span hidden={true} prop="A" />
          <span prop="Still loading..." />
        </>,
      );
    },
  );

  // @gate enableStore && (enableLegacyCache)
  it(
    'regression: primary fragment fiber is not always part of setState ' +
      'return path',
    async () => {
      // Reproduces a bug where updates inside a suspended tree are dropped
      // because the fragment fiber we insert to wrap the hidden children is not
      // part of the return path, so it doesn't get marked during setState.
      const root = ReactNoop.createRoot();

      function Parent() {
        return (
          <>
            <Suspense fallback={<Text text="Loading..." />}>
              <Child />
            </Suspense>
          </>
        );
      }

      const textStore = createStore('A');
      const setText = textStore.update;
      function Child() {
        const text = use(textStore);
        return <AsyncText text={text} />;
      }

      // Mount an initial tree. Resolve A so that it doesn't suspend.
      await seedNextTextCache('A');
      await act(() => {
        root.render(<Parent />);
      });
      assertLog(['A']);
      // At this point, the setState return path follows current fiber.
      expect(root).toMatchRenderedOutput(<span prop="A" />);

      // Schedule another update. This will "flip" the alternate pairs.
      await resolveText('B');
      await act(() => {
        setText('B');
      });
      assertLog(['B']);
      // Now the setState return path follows the *alternate* fiber.
      expect(root).toMatchRenderedOutput(<span prop="B" />);

      // Schedule another update. This time, we'll suspend.
      await act(() => {
        setText('C');
      });
      assertLog(['Suspend! [C]', 'Loading...', 'Suspend! [C]']);

      // Commit. This will insert a fragment fiber to wrap around the component
      // that triggered the update.
      await act(async () => {
        await advanceTimers(250);
      });
      // The fragment fiber is part of the current tree, but the setState return
      // path still follows the alternate path. That means the fragment fiber is
      // not part of the return path.
      expect(root).toMatchRenderedOutput(
        <>
          <span hidden={true} prop="B" />
          <span prop="Loading..." />
        </>,
      );

      // Update again. This should unsuspend the tree.
      await resolveText('D');
      await act(() => {
        setText('D');
      });
      // Even though the fragment fiber is not part of the return path, we should
      // be able to finish rendering.
      assertLog(['D']);
      expect(root).toMatchRenderedOutput(<span prop="D" />);
    },
  );

  // @gate enableStore && (enableLegacyCache)
  it(
    'regression: primary fragment fiber is not always part of setState ' +
      'return path (another case)',
    async () => {
      // Reproduces a bug where updates inside a suspended tree are dropped
      // because the fragment fiber we insert to wrap the hidden children is not
      // part of the return path, so it doesn't get marked during setState.
      const root = ReactNoop.createRoot();

      function Parent() {
        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <Child />
          </Suspense>
        );
      }

      const textStore = createStore('A');
      const setText = textStore.update;
      function Child() {
        const text = use(textStore);
        return <AsyncText text={text} />;
      }

      // Mount an initial tree. Resolve A so that it doesn't suspend.
      await seedNextTextCache('A');
      await act(() => {
        root.render(<Parent />);
      });
      assertLog(['A']);
      // At this point, the setState return path follows current fiber.
      expect(root).toMatchRenderedOutput(<span prop="A" />);

      // Schedule another update. This will "flip" the alternate pairs.
      await resolveText('B');
      await act(() => {
        setText('B');
      });
      assertLog(['B']);
      // Now the setState return path follows the *alternate* fiber.
      expect(root).toMatchRenderedOutput(<span prop="B" />);

      // Schedule another update. This time, we'll suspend.
      await act(() => {
        setText('C');
      });
      assertLog([
        'Suspend! [C]',
        'Loading...',
        // pre-warming
        'Suspend! [C]',
      ]);

      // Commit. This will insert a fragment fiber to wrap around the component
      // that triggered the update.
      await act(async () => {
        await advanceTimers(250);
      });
      // The fragment fiber is part of the current tree, but the setState return
      // path still follows the alternate path. That means the fragment fiber is
      // not part of the return path.
      expect(root).toMatchRenderedOutput(
        <>
          <span hidden={true} prop="B" />
          <span prop="Loading..." />
        </>,
      );

      await act(async () => {
        // Schedule a normal pri update. This will suspend again.
        setText('D');

        // And another update at lower priority. This will unblock.
        await resolveText('E');
        ReactNoop.idleUpdates(() => {
          setText('E');
        });
      });
      // Even though the fragment fiber is not part of the return path, we should
      // be able to finish rendering.
      assertLog([
        'Suspend! [D]',
        // pre-warming
        'Suspend! [D]',
        // end pre-warming
        'E',
      ]);
      expect(root).toMatchRenderedOutput(<span prop="E" />);
    },
  );

  // @gate enableStore && (enableLegacyCache)
  it(
    'after showing fallback, should not flip back to primary content until ' +
      'the update that suspended finishes',
    async () => {
      const {useEffect} = React;
      const root = ReactNoop.createRoot();

      const outerTextStore = createStore('A');
      const setOuterText = outerTextStore.update;
      function Parent({step}) {
        const text = use(outerTextStore);
        return (
          <>
            <Text text={'Outer text: ' + text} />
            <Text text={'Outer step: ' + step} />
            <Suspense fallback={<Text text="Loading..." />}>
              <Child step={step} outerText={text} />
            </Suspense>
          </>
        );
      }

      const innerTextStore = createStore('A');
      const setInnerText = innerTextStore.update;
      function Child({step, outerText}) {
        const text = use(innerTextStore);

        // This will log if the component commits in an inconsistent state
        useEffect(() => {
          if (text === outerText) {
            Scheduler.log('Commit Child');
          } else {
            Scheduler.log('FIXME: Texts are inconsistent (tearing)');
          }
        }, [text, outerText]);

        return (
          <>
            <AsyncText text={'Inner text: ' + text} />
            <Text text={'Inner step: ' + step} />
          </>
        );
      }

      // These always update simultaneously. They must be consistent.
      function setText(text) {
        setOuterText(text);
        setInnerText(text);
      }

      // Mount an initial tree. Resolve A so that it doesn't suspend.
      await seedNextTextCache('Inner text: A');
      await act(() => {
        root.render(<Parent step={0} />);
      });
      assertLog([
        'Outer text: A',
        'Outer step: 0',
        'Inner text: A',
        'Inner step: 0',
        'Commit Child',
      ]);
      expect(root).toMatchRenderedOutput(
        <>
          <span prop="Outer text: A" />
          <span prop="Outer step: 0" />
          <span prop="Inner text: A" />
          <span prop="Inner step: 0" />
        </>,
      );

      // Update. This causes the inner component to suspend.
      await act(() => {
        setText('B');
      });
      assertLog([
        'Outer text: B',
        'Outer step: 0',
        'Suspend! [Inner text: B]',
        'Loading...',
        // pre-warming
        'Suspend! [Inner text: B]',
        'Inner step: 0',
      ]);
      // Commit the placeholder
      await advanceTimers(250);
      expect(root).toMatchRenderedOutput(
        <>
          <span prop="Outer text: B" />
          <span prop="Outer step: 0" />
          <span hidden={true} prop="Inner text: A" />
          <span hidden={true} prop="Inner step: 0" />
          <span prop="Loading..." />
        </>,
      );

      // Schedule a high pri update on the parent.
      await act(() => {
        ReactNoop.discreteUpdates(() => {
          root.render(<Parent step={1} />);
        });
      });

      // Only the outer part can update. The inner part should still show a
      // fallback because we haven't finished loading B yet. Otherwise, the
      // inner text would be inconsistent with the outer text.
      assertLog([
        'Outer text: B',
        'Outer step: 1',
        'Suspend! [Inner text: B]',
        'Loading...',
        // pre-warming
        'Suspend! [Inner text: B]',
        'Inner step: 1',
      ]);
      expect(root).toMatchRenderedOutput(
        <>
          <span prop="Outer text: B" />
          <span prop="Outer step: 1" />
          <span hidden={true} prop="Inner text: A" />
          <span hidden={true} prop="Inner step: 0" />
          <span prop="Loading..." />
        </>,
      );

      // Now finish resolving the inner text
      await act(async () => {
        await resolveText('Inner text: B');
      });
      assertLog(['Inner text: B', 'Inner step: 1', 'Commit Child']);
      expect(root).toMatchRenderedOutput(
        <>
          <span prop="Outer text: B" />
          <span prop="Outer step: 1" />
          <span prop="Inner text: B" />
          <span prop="Inner step: 1" />
        </>,
      );
    },
  );

  // @gate enableStore && (enableLegacyCache)
  it('a high pri update can unhide a boundary that suspended at a different level', async () => {
    const {useEffect} = React;
    const root = ReactNoop.createRoot();

    const outerTextStore = createStore('A');
    const setOuterText = outerTextStore.update;
    function Parent({step}) {
      const text = use(outerTextStore);
      return (
        <>
          <Text text={'Outer: ' + text + step} />
          <Suspense fallback={<Text text="Loading..." />}>
            <Child step={step} outerText={text} />
          </Suspense>
        </>
      );
    }

    const innerTextStore = createStore('A');
    const setInnerText = innerTextStore.update;
    function Child({step, outerText}) {
      const text = use(innerTextStore);

      // This will log if the component commits in an inconsistent state
      useEffect(() => {
        if (text === outerText) {
          Scheduler.log('Commit Child');
        } else {
          Scheduler.log('FIXME: Texts are inconsistent (tearing)');
        }
      }, [text, outerText]);

      return (
        <>
          <AsyncText text={'Inner: ' + text + step} />
        </>
      );
    }

    // These always update simultaneously. They must be consistent.
    function setText(text) {
      setOuterText(text);
      setInnerText(text);
    }

    // Mount an initial tree. Resolve A so that it doesn't suspend.
    await seedNextTextCache('Inner: A0');
    await act(() => {
      root.render(<Parent step={0} />);
    });
    assertLog(['Outer: A0', 'Inner: A0', 'Commit Child']);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Outer: A0" />
        <span prop="Inner: A0" />
      </>,
    );

    // Update. This causes the inner component to suspend.
    await act(() => {
      setText('B');
    });
    assertLog([
      'Outer: B0',
      'Suspend! [Inner: B0]',
      'Loading...',
      // pre-warming
      'Suspend! [Inner: B0]',
    ]);
    // Commit the placeholder
    await advanceTimers(250);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Outer: B0" />
        <span hidden={true} prop="Inner: A0" />
        <span prop="Loading..." />
      </>,
    );

    // Schedule a high pri update on the parent. This will unblock the content.
    await resolveText('Inner: B1');
    await act(() => {
      ReactNoop.discreteUpdates(() => {
        root.render(<Parent step={1} />);
      });
    });

    assertLog(['Outer: B1', 'Inner: B1', 'Commit Child']);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Outer: B1" />
        <span prop="Inner: B1" />
      </>,
    );
  });

  // @gate enableStore && (enableLegacyCache)
  it('regression: ping at high priority causes update to be dropped', async () => {
    const {useTransition} = React;

    const textAStore = createStore('A');
    const setTextA = textAStore.update;
    function A() {
      const textA = use(textAStore);
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <AsyncText text={textA} />
        </Suspense>
      );
    }

    const textBStore = createStore('B');
    const setTextB = textBStore.update;
    let startTransitionFromB;
    function B() {
      const textB = use(textBStore);
      // eslint-disable-next-line no-unused-vars
      const [_, _startTransition] = useTransition();
      startTransitionFromB = _startTransition;
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <AsyncText text={textB} />
        </Suspense>
      );
    }

    function App() {
      return (
        <>
          <A />
          <B />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(async () => {
      await seedNextTextCache('A');
      await seedNextTextCache('B');
      root.render(<App />);
    });
    assertLog(['A', 'B']);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="A" />
        <span prop="B" />
      </>,
    );

    await act(async () => {
      // Triggers suspense at normal pri
      setTextA('A1');
      // Triggers in an unrelated tree at a different pri
      startTransitionFromB(() => {
        // Update A again so that it doesn't suspend on A1. That way we can ping
        // the A1 update without also pinging this one. This is a workaround
        // because there's currently no way to render at a lower priority (B2)
        // without including all updates at higher priority (A1).
        setTextA('A2');
        setTextB('B2');
      });

      await waitFor([
        'Suspend! [A1]',
        'Loading...',
        'B',
        'Suspend! [A2]',
        'Loading...',
        'Suspend! [B2]',
        'Loading...',
      ]);
      expect(root).toMatchRenderedOutput(
        <>
          <span hidden={true} prop="A" />
          <span prop="Loading..." />
          <span prop="B" />
        </>,
      );

      await resolveText('A1');
      await waitFor(['A1']);
    });
    assertLog(['Suspend! [A2]', 'Loading...', 'Suspend! [B2]', 'Loading...']);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="A1" />
        <span prop="B" />
      </>,
    );

    await act(async () => {
      await resolveText('A2');
      await resolveText('B2');
    });
    assertLog(['A2', 'B2']);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="A2" />
        <span prop="B2" />
      </>,
    );
  });

  // Regression: https://github.com/react/react/issues/18486
  // @gate enableStore && (enableLegacyCache)
  it('does not get stuck in pending state with render phase updates', async () => {
    let setTextWithShortTransition;
    let setTextWithLongTransition;
    const textStore = createStore('');
    const mirrorStore = createStore('');
    const setText = textStore.update;

    function App() {
      const [isPending1, startShortTransition] = React.useTransition();
      const [isPending2, startLongTransition] = React.useTransition();
      const isPending = isPending1 || isPending2;
      const text = use(textStore);
      const mirror = use(mirrorStore);

      if (text !== mirror) {
        // Render phase update was needed to repro the bug.
        // store-semantics: store updates during render warn and are rendered
        // after the current render.
        mirrorStore.update(text);
      }

      setTextWithShortTransition = value => {
        startShortTransition(() => {
          setText(value);
        });
      };
      setTextWithLongTransition = value => {
        startLongTransition(() => {
          setText(value);
        });
      };

      return (
        <>
          {isPending ? <Text text="Pending..." /> : null}
          {text !== '' ? <AsyncText text={text} /> : <Text text={text} />}
        </>
      );
    }

    function Root() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <App />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Root />);
    });
    assertLog(['']);
    expect(root).toMatchRenderedOutput(<span prop="" />);

    // Update to "a". That will suspend.
    await act(async () => {
      setTextWithShortTransition('a');
      await waitForAll(['Pending...', '', 'Suspend! [a]', 'Loading...']);
    });
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`App`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`App`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in Root (at **)',
    ]);
    assertLog([]);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Pending..." />
        <span prop="" />
      </>,
    );

    // Update to "b". That will suspend, too.
    await act(async () => {
      setTextWithLongTransition('b');
      await waitForAll([
        // Neither is resolved yet.
        'Pending...',
        '',
        'Suspend! [b]',
        'Loading...',
      ]);
    });
    assertLog([]);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Pending..." />
        <span prop="" />
      </>,
    );

    // Resolve "a". But "b" is still pending.
    await act(async () => {
      await resolveText('a');

      await waitForAll(['Suspend! [b]', 'Loading...']);
      expect(root).toMatchRenderedOutput(
        <>
          <span prop="Pending..." />
          <span prop="" />
        </>,
      );

      // Resolve "b". This should remove the pending state.
      await act(async () => {
        await resolveText('b');
      });
      assertLog(['b']);
      // The bug was that the pending state got stuck forever.
      expect(root).toMatchRenderedOutput(<span prop="b" />);
    });
  });

  // @gate enableStore && (enableLegacyCache && enableRetryLaneExpiration)
  it('recurring updates in siblings should not block expensive content in suspense boundary from committing', async () => {
    const textStore = createStore('1');
    const setText = textStore.update;
    function UpdatingText() {
      const text = use(textStore);
      return <Text text={text} />;
    }

    function ExpensiveText({text, ms}) {
      Scheduler.log(text);
      Scheduler.unstable_advanceTime(ms);
      return <span prop={text} />;
    }

    function App() {
      return (
        <>
          <UpdatingText />
          <Suspense fallback={<Text text="Loading..." />}>
            <AsyncText text="Async" />
            <ExpensiveText text="A" ms={1000} />
            <ExpensiveText text="B" ms={3999} />
            <ExpensiveText text="C" ms={100000} />
          </Suspense>
        </>
      );
    }

    const root = ReactNoop.createRoot();
    root.render(<App />);
    await waitForAll([
      '1',
      'Suspend! [Async]',
      'Loading...',
      // pre-warming
      'Suspend! [Async]',
      'A',
      'B',
      'C',
    ]);
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="1" />
        <span prop="Loading..." />
      </>,
    );

    await resolveText('Async');
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="1" />
        <span prop="Loading..." />
      </>,
    );

    await waitFor(['Async', 'A', 'B']);
    ReactNoop.expire(100000);
    await advanceTimers(100000);
    setText('2');
    await waitForPaint(['2']);

    await waitForMicrotasks();
    Scheduler.unstable_flushNumberOfYields(1);
    assertLog(['Async', 'A', 'B', 'C']);

    expect(root).toMatchRenderedOutput(
      <>
        <span prop="2" />
        <span prop="Async" />
        <span prop="A" />
        <span prop="B" />
        <span prop="C" />
      </>,
    );
  });
});
