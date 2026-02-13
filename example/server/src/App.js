const React = require('react');
const Counter = require('./components/Counter');
const TextInput = require('./components/TextInput');

function App() {
  const timestamp = new Date().toLocaleTimeString();

  return (
    <div style={{padding: 20, gap: 16}}>
      <h1>react-dom-native</h1>
      <p>This page is rendered by React Server Components on native iOS.</p>

      <div style={{gap: 12}}>
        <h2>Counter</h2>
        <Counter initialCount={0} />
      </div>

      <div style={{gap: 12}}>
        <h2>Search</h2>
        <TextInput placeholder="Search fruits..." />
      </div>

      <p style={{color: '#888', fontSize: 12}}>
        {`Rendered at ${timestamp}`}
      </p>
    </div>
  );
}

module.exports = App;
module.exports.default = App;
