'use strict';

var React = require('react');

module.exports = function OverflowHidden() {
  return (
    <div style={{width: 390}}>
      {/* Child larger than parent, clipped by overflow hidden */}
      <div style={{
        width: 200,
        height: 100,
        overflow: 'hidden',
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 300, height: 150, backgroundColor: '#ff9999'}} />
      </div>

      {/* Overflow visible (default) — child exceeds parent */}
      <div style={{
        width: 200,
        height: 100,
        marginTop: 20,
        backgroundColor: '#dddddd',
      }}>
        <div style={{width: 300, height: 150, backgroundColor: '#99ccff'}} />
      </div>

      {/* Text clipped by overflow hidden */}
      <div style={{
        width: 150,
        height: 40,
        overflow: 'hidden',
        marginTop: 20,
        backgroundColor: '#eeeedd',
      }}>
        <p style={{height: 100}}>This is a long paragraph that should be clipped by the overflow hidden container.</p>
      </div>
    </div>
  );
};
