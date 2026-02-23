'use strict';

var React = require('react');

module.exports = function AbsoluteZIndexStacking() {
  return (
    <div style={{padding: 8}}>
      {/* Basic z-index with absolute overlap */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 100,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{position: 'absolute', top: 10, left: 10, width: 80, height: 80, backgroundColor: '#4a90d9', zIndex: 1}} />
        <div style={{position: 'absolute', top: 30, left: 30, width: 80, height: 80, backgroundColor: '#d94a4a', zIndex: 2}} />
        <div style={{position: 'absolute', top: 50, left: 50, width: 80, height: 80, backgroundColor: '#5ba55b', zIndex: 3}} />
      </div>

      {/* Reverse z-index order (higher zIndex behind) */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 100,
        backgroundColor: '#dae8fc',
        marginBottom: 8,
      }}>
        <div style={{position: 'absolute', top: 10, left: 10, width: 80, height: 80, backgroundColor: '#4a90d9', zIndex: 3}} />
        <div style={{position: 'absolute', top: 30, left: 30, width: 80, height: 80, backgroundColor: '#d94a4a', zIndex: 2}} />
        <div style={{position: 'absolute', top: 50, left: 50, width: 80, height: 80, backgroundColor: '#5ba55b', zIndex: 1}} />
      </div>

      {/* Same z-index: document order wins */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 100,
        backgroundColor: '#d5e8d4',
        marginBottom: 8,
      }}>
        <div style={{position: 'absolute', top: 10, left: 10, width: 100, height: 80, backgroundColor: '#5ba55b', zIndex: 1}} />
        <div style={{position: 'absolute', top: 20, left: 40, width: 100, height: 80, backgroundColor: '#27ae60', zIndex: 1}} />
        <div style={{position: 'absolute', top: 30, left: 70, width: 100, height: 80, backgroundColor: '#1abc9c', zIndex: 1}} />
      </div>

      {/* z-index 0 vs no z-index */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 80,
        backgroundColor: '#fff3cd',
        marginBottom: 8,
      }}>
        <div style={{position: 'absolute', top: 10, left: 10, width: 120, height: 60, backgroundColor: '#e67e22'}} />
        <div style={{position: 'absolute', top: 20, left: 50, width: 120, height: 60, backgroundColor: '#f1c40f', zIndex: 0}} />
      </div>

      {/* Negative z-index renders behind parent content */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 80,
        backgroundColor: '#f5f0ff',
        marginBottom: 8,
      }}>
        <div style={{position: 'absolute', top: 5, left: 5, width: 200, height: 70, backgroundColor: '#9b59b6', zIndex: -1}} />
        <div style={{width: 150, height: 40, backgroundColor: '#e8d5f5'}} />
      </div>

      {/* Multiple layers with varied z-index values */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 120,
        backgroundColor: '#f8cecc',
      }}>
        <div style={{position: 'absolute', top: 0, left: 0, width: 150, height: 100, backgroundColor: '#d94a4a', zIndex: 10}} />
        <div style={{position: 'absolute', top: 10, left: 40, width: 150, height: 100, backgroundColor: '#e57373', zIndex: 5}} />
        <div style={{position: 'absolute', top: 20, left: 80, width: 150, height: 100, backgroundColor: '#ef9a9a', zIndex: 20}} />
        <div style={{position: 'absolute', top: 30, left: 120, width: 150, height: 100, backgroundColor: '#ffcdd2', zIndex: 1}} />
      </div>
    </div>
  );
};
