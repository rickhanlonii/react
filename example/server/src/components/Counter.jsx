'use client';

var React = require('react');
var useState = React.useState;

function Counter(props) {
  var initialCount = props.initialCount || 0;
  var countState = useState(initialCount);
  var count = countState[0];
  var setCount = countState[1];

  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <button
        onClick={function () {
          setCount(function (c) {
            return c - 1;
          });
        }}>
        <span>-</span>
      </button>
      <span>{String(count)}</span>
      <button
        onClick={function () {
          setCount(function (c) {
            return c + 1;
          });
        }}>
        <span>+</span>
      </button>
    </div>
  );
}

module.exports = Counter;
module.exports.default = Counter;
