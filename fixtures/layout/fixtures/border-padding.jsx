'use strict';

var React = require('react');

module.exports = function BorderPadding() {
  return (
    <div>
      <div style={{
        width: 200,
        height: 100,
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: '#333333',
        padding: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 50, height: 50, backgroundColor: '#cccccc'}} />
      </div>
      <div style={{
        width: 250,
        borderTopWidth: 6,
        borderBottomWidth: 2,
        borderLeftWidth: 4,
        borderRightWidth: 4,
        borderStyle: 'solid',
        borderColor: '#666666',
        paddingTop: 15,
        paddingBottom: 5,
        paddingLeft: 10,
        paddingRight: 10,
        backgroundColor: '#dddddd',
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#bbbbbb'}} />
        <div style={{width: 60, height: 30, backgroundColor: '#aaaaaa'}} />
      </div>
    </div>
  );
};
