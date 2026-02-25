'use client';

const React = require('react');
const {useState} = React;

function Counter({initialCount = 0}) {
  const [count, setCount] = useState(initialCount);
  React.useEffect(() => {
    setCount(c => c + 1);
  }, []);
  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
      <button onClick={() => setCount((c) => c - 1)}>
        <span>-</span>
      </button>
      <span style={{width: 12, textAlign: 'center', marginLeft: 4, marginRight: 4}}>{String(count)}</span>
      <button onClick={() => setCount((c) => c + 1)}>
        <span>+</span>
      </button>
      <p>test</p>
    </div>
  );
}


module.exports = Counter;
module.exports.default = Counter;
module.exports.someConfig = { version: 2 };
