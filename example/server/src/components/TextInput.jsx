'use client';

var React = require('react');
var useState = React.useState;

function TextInput(props) {
  var placeholder = props.placeholder || 'Type here...';
  var valueState = useState('');
  var value = valueState[0];
  var setValue = valueState[1];

  return (
    <div style={{gap: 4}}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={function (e) {
          setValue(e && e.value ? e.value : '');
        }}
      />
      <p>{'You typed: ' + value}</p>
    </div>
  );
}

module.exports = TextInput;
module.exports.default = TextInput;
