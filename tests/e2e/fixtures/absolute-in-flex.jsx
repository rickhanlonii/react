'use strict';

var React = require('react');

module.exports = function AbsoluteInFlex() {
  return (
    <div style={{width: 390}}>
      {/* Absolute child inside flex row — removed from flow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        height: 80,
        backgroundColor: '#f0f0f0',
        padding: 8,
        position: 'relative',
      }}>
        <div style={{width: 60, height: 60, backgroundColor: '#ff9999'}} />
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 40,
          height: 40,
          backgroundColor: '#9999ff',
        }} />
        <div style={{width: 60, height: 60, backgroundColor: '#99ff99'}} />
      </div>

      {/* Absolute overlay on flex column */}
      <div style={{
        position: 'relative',
        marginTop: 12,
        padding: 10,
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{height: 30, backgroundColor: '#ffaaaa'}} />
        <div style={{height: 30, marginTop: 6, backgroundColor: '#aaffaa'}} />
        <div style={{height: 30, marginTop: 6, backgroundColor: '#aaaaff'}} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#00000022',
        }} />
      </div>

      {/* Absolute positioned at each corner */}
      <div style={{
        position: 'relative',
        height: 120,
        marginTop: 12,
        backgroundColor: '#f5f5dc',
      }}>
        <div style={{
          position: 'absolute',
          top: 4,
          left: 4,
          width: 30,
          height: 30,
          backgroundColor: '#ff6666',
        }} />
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 30,
          height: 30,
          backgroundColor: '#66ff66',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 4,
          left: 4,
          width: 30,
          height: 30,
          backgroundColor: '#6666ff',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 30,
          height: 30,
          backgroundColor: '#ffff66',
        }} />
      </div>

      {/* Absolute child does not affect flex sizing */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop: 12,
        position: 'relative',
        backgroundColor: '#e0f0e0',
        padding: 8,
      }}>
        <div style={{flexGrow: 1, height: 50, backgroundColor: '#88cc88'}} />
        <div style={{flexGrow: 1, height: 50, backgroundColor: '#66aa66'}} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 175,
          width: 40,
          height: 40,
          backgroundColor: '#cc4444',
        }} />
      </div>
    </div>
  );
};
