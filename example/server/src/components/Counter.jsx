'use client';

const React = require('react');
const {useState} = React;

function Counter({initialCount = 0}) {
  const [count, setCount] = useState(initialCount);

  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <button onClick={() => setCount((c) => c - 1)}>
        <span>-</span>
      </button>
      <span>{String(count)}</span>
      <button onClick={() => setCount((c) => c + 1)}>
        <span>+</span>
      </button>
    </div>
  );
}

module.exports = Counter;
module.exports.default = Counter;
