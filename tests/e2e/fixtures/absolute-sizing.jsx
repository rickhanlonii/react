'use strict';

var React = require('react');

module.exports = function AbsoluteSizing() {
  return (
    <div style={{width: 390}}>
      {/* top + bottom defines height */}
      <div style={{
        position: 'relative',
        height: 100,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          bottom: 10,
          left: 20,
          width: 60,
          backgroundColor: '#ff9999',
        }} />
      </div>

      {/* left + right defines width */}
      <div style={{
        position: 'relative',
        height: 60,
        marginTop: 12,
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{
          position: 'absolute',
          left: 20,
          right: 20,
          top: 10,
          height: 40,
          backgroundColor: '#99ff99',
        }} />
      </div>

      {/* All four edges — fully stretches to fill with insets */}
      <div style={{
        position: 'relative',
        height: 100,
        marginTop: 12,
        backgroundColor: '#f5f5dc',
      }}>
        <div style={{
          position: 'absolute',
          top: 15,
          right: 15,
          bottom: 15,
          left: 15,
          backgroundColor: '#ddcc88',
          borderRadius: 6,
        }} />
      </div>

      {/* Multiple absolute children with edge-defined sizing */}
      <div style={{
        position: 'relative',
        height: 120,
        marginTop: 12,
        backgroundColor: '#eef0ee',
      }}>
        {/* Left strip */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 4,
          backgroundColor: '#2255aa',
        }} />
        {/* Content area */}
        <div style={{
          position: 'absolute',
          top: 10,
          bottom: 10,
          left: 14,
          right: 10,
          backgroundColor: '#ffffff',
          borderRadius: 4,
          padding: 8,
        }}>
          <p style={{fontSize: 14, fontWeight: 'bold'}}>Card with accent</p>
          <p style={{fontSize: 12, color: '#888888', marginTop: 4}}>Left border strip</p>
        </div>
      </div>

      {/* Absolute with width + right (positioned from right edge) */}
      <div style={{
        position: 'relative',
        height: 60,
        marginTop: 12,
        backgroundColor: '#f0eef0',
      }}>
        <div style={{
          position: 'absolute',
          right: 10,
          top: 10,
          width: 100,
          height: 40,
          backgroundColor: '#ccaadd',
        }} />
      </div>

      {/* Absolute with height + bottom (positioned from bottom) */}
      <div style={{
        position: 'relative',
        height: 80,
        marginTop: 12,
        backgroundColor: '#fff5ee',
      }}>
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          right: 8,
          height: 30,
          backgroundColor: '#ffccaa',
          borderRadius: 4,
        }} />
      </div>
    </div>
  );
};
