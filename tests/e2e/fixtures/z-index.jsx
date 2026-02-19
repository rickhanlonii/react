'use strict';

var React = require('react');

module.exports = function ZIndex() {
  return (
    <div>
      {/* Overlapping absolute children with z-index stacking */}
      <div style={{
        width: 250,
        height: 150,
        backgroundColor: '#eeeeee',
        position: 'relative',
      }}>
        <div style={{
          width: 100,
          height: 100,
          backgroundColor: '#ff9999',
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1,
        }} />
        <div style={{
          width: 100,
          height: 100,
          backgroundColor: '#99ff99',
          position: 'absolute',
          top: 30,
          left: 50,
          zIndex: 3,
        }} />
        <div style={{
          width: 100,
          height: 100,
          backgroundColor: '#9999ff',
          position: 'absolute',
          top: 50,
          left: 90,
          zIndex: 2,
        }} />
      </div>
      {/* Negative z-index (behind parent content) */}
      <div style={{
        width: 200,
        height: 100,
        backgroundColor: '#dddddd',
        position: 'relative',
        marginTop: 10,
        padding: 10,
      }}>
        <div style={{
          width: 80,
          height: 80,
          backgroundColor: '#ffcc99',
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: -1,
        }} />
        <div style={{width: 60, height: 60, backgroundColor: '#cc99ff'}} />
      </div>
    </div>
  );
};
