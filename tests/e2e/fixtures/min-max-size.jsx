'use strict';

var React = require('react');

module.exports = function MinMaxSize() {
  return (
    <div style={{width: 390}}>
      {/* minWidth: child wider than minWidth */}
      <div style={{
        minWidth: 200,
        height: 40,
        backgroundColor: '#ff9999',
      }} />

      {/* maxWidth: limits element width */}
      <div style={{
        maxWidth: 150,
        height: 40,
        marginTop: 10,
        backgroundColor: '#99ff99',
      }}>
        <div style={{width: 300, height: 20, backgroundColor: '#66cc66'}} />
      </div>

      {/* minHeight: element taller than content */}
      <div style={{
        width: 200,
        minHeight: 80,
        marginTop: 10,
        backgroundColor: '#9999ff',
      }}>
        <div style={{width: 50, height: 20, backgroundColor: '#6666cc'}} />
      </div>

      {/* maxHeight: clips overflow */}
      <div style={{
        width: 200,
        maxHeight: 60,
        marginTop: 10,
        overflow: 'hidden',
        backgroundColor: '#ffcc99',
      }}>
        <div style={{width: 50, height: 30, backgroundColor: '#cc9966'}} />
        <div style={{width: 50, height: 30, backgroundColor: '#996633'}} />
        <div style={{width: 50, height: 30, backgroundColor: '#663300'}} />
      </div>

      {/* minWidth + maxWidth together */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 8, marginTop: 10}}>
        <div style={{
          minWidth: 80,
          maxWidth: 120,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#ffaaaa',
        }} />
        <div style={{
          flexGrow: 1,
          height: 40,
          backgroundColor: '#aaffaa',
        }} />
      </div>

      {/* minHeight + maxHeight together */}
      <div style={{
        width: 200,
        minHeight: 50,
        maxHeight: 100,
        marginTop: 10,
        backgroundColor: '#aaaaff',
      }}>
        <div style={{width: 80, height: 20, backgroundColor: '#8888cc'}} />
      </div>
    </div>
  );
};
