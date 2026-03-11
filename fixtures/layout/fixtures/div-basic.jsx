'use strict';

var React = require('react');

module.exports = function DivBasic() {
  return (
    <div style={{width: 200, height: 100, backgroundColor: '#eeeeee'}}>
      <div style={{width: 50, height: 50, backgroundColor: '#cccccc'}} />
    </div>
  );
};
