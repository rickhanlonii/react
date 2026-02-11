'use client';

var React = require('react');
var useState = React.useState;

function Counter(props) {
  var initialCount = props.initialCount || 0;
  var countState = useState(initialCount);
  var count = countState[0];
  var setCount = countState[1];

  return React.createElement(
    'div',
    {style: {flexDirection: 'row', alignItems: 'center', gap: 8}},
    React.createElement(
      'button',
      {
        onClick: function () {
          setCount(function (c) {
            return c - 1;
          });
        },
      },
      React.createElement('span', null, '-')
    ),
    React.createElement('span', null, String(count)),
    React.createElement(
      'button',
      {
        onClick: function () {
          setCount(function (c) {
            return c + 1;
          });
        },
      },
      React.createElement('span', null, '+')
    )
  );
}

module.exports = Counter;
module.exports.default = Counter;
