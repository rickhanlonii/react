'use strict';

var React = require('react');

module.exports = function AbsoluteWithPadding() {
  return (
    <div style={{padding: 8}}>
      {/* Absolute child inside padded parent */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 120,
        padding: 20,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 80,
          height: 40,
          backgroundColor: '#4a90d9',
        }} />
        <div style={{height: 40, backgroundColor: '#dae8fc'}} />
      </div>

      {/* Absolute with top/left 0 starts at padding edge */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 100,
        padding: 24,
        backgroundColor: '#d5e8d4',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 60,
          height: 60,
          backgroundColor: '#5ba55b',
        }} />
      </div>

      {/* Absolute fill inside padded parent */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 100,
        padding: 16,
        backgroundColor: '#fff3cd',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#e67e22',
          opacity: 0.2,
        }} />
        <div style={{height: 30, backgroundColor: '#e67e22', borderRadius: 4}} />
      </div>

      {/* Different padding per side with absolute children */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 120,
        paddingTop: 30,
        paddingLeft: 40,
        paddingRight: 10,
        paddingBottom: 10,
        backgroundColor: '#dae8fc',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 5,
          right: 5,
          width: 40,
          height: 40,
          backgroundColor: '#4a90d9',
          borderRadius: 20,
        }} />
        <div style={{height: 30, backgroundColor: '#87ceeb', borderRadius: 4}} />
      </div>

      {/* Nested padded containers with absolute */}
      <div style={{
        position: 'relative',
        width: 374,
        padding: 16,
        backgroundColor: '#f5f0ff',
        marginBottom: 8,
      }}>
        <div style={{
          padding: 16,
          backgroundColor: '#e8d5f5',
        }}>
          <div style={{
            position: 'relative',
            padding: 16,
            backgroundColor: '#d1c4e9',
            height: 80,
          }}>
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 30,
              height: 30,
              backgroundColor: '#9b59b6',
              borderRadius: 4,
            }} />
          </div>
        </div>
      </div>

      {/* Absolute children at corners of padded parent */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 120,
        padding: 20,
        backgroundColor: '#f8cecc',
      }}>
        <div style={{position: 'absolute', top: 4, left: 4, width: 24, height: 24, backgroundColor: '#d94a4a', borderRadius: 4}} />
        <div style={{position: 'absolute', top: 4, right: 4, width: 24, height: 24, backgroundColor: '#e67e22', borderRadius: 4}} />
        <div style={{position: 'absolute', bottom: 4, left: 4, width: 24, height: 24, backgroundColor: '#5ba55b', borderRadius: 4}} />
        <div style={{position: 'absolute', bottom: 4, right: 4, width: 24, height: 24, backgroundColor: '#4a90d9', borderRadius: 4}} />
      </div>
    </div>
  );
};
