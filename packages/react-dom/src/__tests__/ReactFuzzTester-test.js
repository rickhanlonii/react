/**
 * @jest-environment jsdom
 *
 * Fuzz: Activity + Suspense + legacy context + error boundary
 * with RANDOM wrapper order on every render.
 * Fails if React logs “Unexpected context found on stack”.
 */

let React;
let Suspense;
let startTransition;
let useId;
let ReactDOMClient;
let PropTypes;

let act;
let assertConsoleErrorDev;
let Activity;

beforeEach(() => {
  jest.resetModules();
  React = require('react');
  Suspense = React.Suspense;
  startTransition = React.startTransition;
  useId = React.useId;
  act = React.act;
  ReactDOMClient = require('react-dom/client');
  Activity = React.unstable_Activity;
  PropTypes = require('prop-types');
  ({act, assertConsoleErrorDev} = require('internal-test-utils'));
});

describe('ReactFuzzTester', () => {
  // ───────────────────────────────── The fuzz test
  it('never leaves the context stack mismatched (random wrapper order)', async () => {
    // ───────────────────────────────── Legacy context
    class LegacyProvider extends React.Component {
      getChildContext() {
        return {flavor: this.props.value};
      }
      render() {
        return this.props.children;
      }
    }
    LegacyProvider.childContextTypes = {flavor: PropTypes.string};

    class LegacyConsumer extends React.Component {
      static contextTypes = {flavor: PropTypes.string};
      render() {
        return <span data-legacy={this.context.flavor} />;
      }
    }

    // ───────────────────────────────── Suspense helper
    const cache = new Set();
    function read(key) {
      if (cache.has(key)) return;
      throw new Promise(r => {
        cache.add(key);
        queueMicrotask(r);
      });
    }
    function AsyncLeaf({label}) {
      read(label);
      return <span>{label}</span>;
    }

    // ───────────────────────────────── Error boundary + bomb
    class Boundary extends React.Component {
      state = {err: null};
      componentDidCatch(e) {
        this.setState({err: e});
      }
      render() {
        return this.state.err ? <span>err</span> : this.props.children;
      }
    }
    function Bomb() {
      throw new Error('💥');
    }

    // ───────────────────────────────── Utility: random shuffle
    function shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    // ───────────────────────────────── Fuzz component
    function Fuzz({mask, order}) {
      const showLegacy = mask & 1;
      const throwErr = mask & 2;
      const switching = mask & 4;

      const mode = switching ? 'hidden' : 'visible';
      const id = useId();
      const leaf = throwErr ? <Bomb /> : <AsyncLeaf label={id} />;
      const legacyBits = showLegacy ? <LegacyConsumer /> : null;

      // Nest wrappers according to the random order (outer→inner).
      let tree = leaf;
      for (const k of order) {
        switch (k) {
          case 'activity':
            tree = <Activity mode={mode}>{tree}</Activity>;
            break;
          case 'suspense':
            tree = <Suspense fallback={<span>⏳</span>}>{tree}</Suspense>;
            break;
          case 'boundary':
            tree = <Boundary>{tree}</Boundary>;
            break;
          case 'legacy':
            tree = (
              <LegacyProvider value="vanilla">
                {legacyBits}
                {tree}
              </LegacyProvider>
            );
            break;
        }
      }
      return tree;
    }

    const div = document.createElement('div');
    const root = ReactDOMClient.createRoot(div);

    // intercept React warnings so we can scan them later
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args) => {});

    const wrapKinds = ['activity', 'suspense', 'boundary', 'legacy'];

    await act(async () => {
      root.render(<Fuzz mask={0} order={wrapKinds} />);
    });

    const RUNS = 5_000;
    for (let i = 0; i < RUNS; i++) {
      console.log(`Run ${i + 1}/${RUNS}`);
      const mask = Math.floor(Math.random() * 8); // 3 bits
      const order = shuffle([...wrapKinds]); // new permutation

      await act(async () => {
        const render = () => root.render(<Fuzz mask={mask} order={order} />);
        Math.random() < 0.3 ? startTransition(render) : render();
      });
    }

    const stackBug = spy.mock.calls.some((call, ...args) => {
      if (call && call instanceof Error && call.message.includes('💥')) {
        return false;
      }

      console.log('logging', call[1], 'args', args);
      return (
        typeof call === 'string' &&
        call.includes('Unexpected context found on stack')
      );
    });
    // spy.mockRestore();
    expect(stackBug).toBe(false);
  });
});
