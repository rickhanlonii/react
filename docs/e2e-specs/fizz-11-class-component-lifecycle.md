# Class Component Lifecycle During SSR: constructor, UNSAFE_componentWillMount, render

## Category
fizz

## Description
Validates that class component lifecycle methods execute correctly during Fizz server-side rendering. On the server, only `constructor`, `UNSAFE_componentWillMount` (formerly `componentWillMount`), and `render` are called. Other lifecycle methods like `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`, and `getDerivedStateFromProps` are either not called or handled specially. `static getDerivedStateFromProps` IS called on the server to compute derived state before rendering.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (class component tests)
- `packages/react-server/src/ReactFizzServer.js` (class component rendering path)

## App Setup
```jsx
// Track which lifecycle methods were called
const lifecycleCalls = [];

class BasicClassComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { initialized: true, count: 0 };
    lifecycleCalls.push('constructor');
  }

  UNSAFE_componentWillMount() {
    lifecycleCalls.push('UNSAFE_componentWillMount');
    // setState in UNSAFE_componentWillMount should be batched into initial render
    this.setState({ count: 1 });
  }

  componentDidMount() {
    lifecycleCalls.push('componentDidMount'); // should NOT be called on server
  }

  componentWillUnmount() {
    lifecycleCalls.push('componentWillUnmount'); // should NOT be called on server
  }

  render() {
    lifecycleCalls.push('render');
    return (
      <div id="class-basic">
        <span id="class-initialized">{String(this.state.initialized)}</span>
        <span id="class-count">{this.state.count}</span>
      </div>
    );
  }
}

class DerivedStateComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { derived: null };
  }

  static getDerivedStateFromProps(props, state) {
    lifecycleCalls.push('getDerivedStateFromProps');
    return { derived: props.value * 2 };
  }

  render() {
    return <div id="class-derived">{this.state.derived}</div>;
  }
}

class DefaultPropsComponent extends React.Component {
  static defaultProps = {
    greeting: 'Hello',
    punctuation: '!',
  };

  render() {
    return (
      <div id="class-defaults">
        {this.props.greeting}, {this.props.name}{this.props.punctuation}
      </div>
    );
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return <div id="error-boundary">{this.state.errorMessage}</div>;
    }
    return this.props.children;
  }
}

function ClassComponentApp() {
  return (
    <div>
      <BasicClassComponent />
      <DerivedStateComponent value={21} />
      <DefaultPropsComponent name="World" />
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<ClassComponentApp />)`.

## Load Sequence
1. Server creates class component instances by calling `constructor`.
2. `UNSAFE_componentWillMount` is called before `render`.
3. `static getDerivedStateFromProps` is called for components that define it.
4. `render` is called to produce the output.
5. `componentDidMount` is NOT called on the server.
6. HTML is flushed.
7. Client hydrates, and `componentDidMount` fires on the client.

## Actions
1. Clear the `lifecycleCalls` tracking array.
2. Server-render `<ClassComponentApp />` and collect HTML output.
3. Inspect which lifecycle methods were called during SSR.
4. Parse the HTML and verify rendered output.
5. Hydrate with `hydrateRoot`.

## Assertions
1. The `lifecycleCalls` array during SSR contains `constructor`, `UNSAFE_componentWillMount`, `getDerivedStateFromProps`, and `render` calls.
2. The `lifecycleCalls` array does NOT contain `componentDidMount` or `componentWillUnmount`.
3. `#class-initialized` contains `true` (state from constructor).
4. `#class-count` contains `1` (state updated in UNSAFE_componentWillMount was batched).
5. `#class-derived` contains `42` (getDerivedStateFromProps computed `21 * 2`).
6. `#class-defaults` contains `Hello, World!` (defaultProps applied).
7. Hydration completes without warnings.
8. After hydration, `componentDidMount` is called on the client.
