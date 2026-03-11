'use strict';

var React = require('react');

module.exports = function BoxModel() {
  return (
    <div>
      <div style={{
        margin: 10,
        padding: 20,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 100, height: 50, backgroundColor: '#cccccc'}} />
      </div>
      <div style={{
        marginTop: 5,
        marginBottom: 15,
        marginLeft: 20,
        marginRight: 20,
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 5,
        paddingRight: 5,
        backgroundColor: '#dddddd',
      }}>
        <div style={{width: 80, height: 30, backgroundColor: '#bbbbbb'}} />
      </div>
    </div>
  );
};
