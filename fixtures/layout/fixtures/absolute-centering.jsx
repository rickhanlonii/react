'use strict';

var React = require('react');

module.exports = function AbsoluteCentering() {
  return (
    <div style={{padding: 8}}>
      {/* Center with top/left 50% and negative margin */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 150,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 55,
          left: 167,
          width: 40,
          height: 40,
          backgroundColor: '#4a90d9',
        }} />
      </div>

      {/* Center with all four edges equal */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 150,
        backgroundColor: '#dae8fc',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 25,
          bottom: 25,
          left: 25,
          right: 25,
          backgroundColor: '#4a90d9',
          borderRadius: 8,
        }} />
      </div>

      {/* Multiple centered elements at different positions */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 150,
        backgroundColor: '#d5e8d4',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 50,
          height: 50,
          backgroundColor: '#5ba55b',
          borderRadius: 4,
        }} />
        <div style={{
          position: 'absolute',
          top: 50,
          left: 162,
          width: 50,
          height: 50,
          backgroundColor: '#27ae60',
          borderRadius: 4,
        }} />
        <div style={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          width: 50,
          height: 50,
          backgroundColor: '#1abc9c',
          borderRadius: 4,
        }} />
      </div>

      {/* Absolute centered overlay with padding */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 120,
        backgroundColor: '#fff3cd',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 20,
          bottom: 20,
          left: 40,
          right: 40,
          backgroundColor: '#ffffff',
          borderWidth: 2,
          borderColor: '#e67e22',
          borderRadius: 8,
          padding: 12,
        }}>
          <div style={{fontSize: 13, fontWeight: 'bold', color: '#e67e22'}}>Centered Card</div>
          <div style={{fontSize: 11, color: '#888888'}}>With padding and border</div>
        </div>
      </div>

      {/* Absolute fill (all edges 0) */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 80,
        backgroundColor: '#f5f0ff',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#9b59b6',
          opacity: 0.3,
        }} />
        <div style={{padding: 8}}>
          <div style={{fontSize: 13, color: '#333333'}}>Content under overlay</div>
        </div>
      </div>

      {/* Horizontal centering with left/right equal */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 80,
        backgroundColor: '#f8cecc',
      }}>
        <div style={{
          position: 'absolute',
          top: 15,
          left: 87,
          right: 87,
          height: 50,
          backgroundColor: '#d94a4a',
          borderRadius: 4,
        }} />
      </div>
    </div>
  );
};
