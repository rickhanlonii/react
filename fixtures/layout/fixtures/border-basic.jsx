'use strict';

var React = require('react');

module.exports = function BorderBasic() {
  return (
    <div>
      <div style={{
        width: 200,
        height: 100,
        borderWidth: 4,
        
        borderStyle: 'solid',
        borderColor: '#333333',
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 50, height: 50, backgroundColor: '#cccccc'}} />
      </div>
      <div style={{
        width: 200,
        height: 80,
        borderTopWidth: 8,
        borderBottomWidth: 2,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderStyle: 'solid',
        borderColor: '#666666',
        backgroundColor: '#dddddd',
      }}>
        <div style={{width: 50, height: 30, backgroundColor: '#bbbbbb'}} />
      </div>
    </div>
  );
};
