'use strict';

var React = require('react');

module.exports = function OverflowWithAbsolute() {
  return (
    <div style={{width: 390}}>
      {/* overflow:hidden clips absolute child that extends beyond */}
      <div style={{
        position: 'relative',
        width: 200,
        height: 100,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#cccccc',
      }}>
        <div style={{
          position: 'absolute',
          top: -20,
          left: -20,
          width: 80,
          height: 80,
          backgroundColor: '#ff999966',
          borderRadius: 40,
        }} />
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          width: 80,
          height: 80,
          backgroundColor: '#9999ff66',
          borderRadius: 40,
        }} />
      </div>

      {/* overflow:visible (default) does not clip */}
      <div style={{
        position: 'relative',
        width: 200,
        height: 100,
        marginTop: 30,
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#cccccc',
      }}>
        <div style={{
          position: 'absolute',
          top: -15,
          right: -15,
          width: 50,
          height: 50,
          backgroundColor: '#66cc66',
        }} />
      </div>

      {/* overflow:hidden on flex container with absolute child */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
        height: 80,
        overflow: 'hidden',
        marginTop: 30,
        backgroundColor: '#eeeeff',
      }}>
        <div style={{flex: 1, backgroundColor: '#ddddff'}} />
        <div style={{flex: 1, backgroundColor: '#ccccee'}} />
        <div style={{
          position: 'absolute',
          top: -10,
          left: 60,
          width: 60,
          height: 100,
          backgroundColor: '#ff888866',
        }} />
      </div>

      {/* overflow:hidden with borderRadius creates rounded clipping */}
      <div style={{
        position: 'relative',
        width: 150,
        height: 150,
        overflow: 'hidden',
        borderRadius: 75,
        marginTop: 12,
        backgroundColor: '#ffeecc',
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 75,
          height: 150,
          backgroundColor: '#ffcc88',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 75,
          height: 75,
          backgroundColor: '#ff9944',
        }} />
      </div>
    </div>
  );
};
