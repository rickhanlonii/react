'use strict';

var React = require('react');

module.exports = function OverflowHiddenNested() {
  return (
    <div style={{padding: 8}}>
      {/* Outer overflow:hidden clips grandchild that exceeds both parent and grandparent */}
      <div style={{
        width: 200,
        height: 100,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        marginBottom: 12,
      }}>
        <div style={{width: 180, height: 80, backgroundColor: '#dae8fc', padding: 8}}>
          <div style={{width: 300, height: 120, backgroundColor: '#4a90d9'}} />
        </div>
      </div>

      {/* Both parent and child have overflow:hidden — each clips independently */}
      <div style={{
        width: 250,
        height: 120,
        overflow: 'hidden',
        backgroundColor: '#d5e8d4',
        marginBottom: 12,
        padding: 8,
      }}>
        <div style={{
          width: 200,
          height: 80,
          overflow: 'hidden',
          backgroundColor: '#c8e6c9',
          padding: 8,
        }}>
          <div style={{width: 350, height: 150, backgroundColor: '#5ba55b'}} />
        </div>
      </div>

      {/* Inner overflow:hidden but outer is visible — only inner clips */}
      <div style={{
        width: 250,
        height: 120,
        backgroundColor: '#fff3cd',
        marginBottom: 12,
        padding: 8,
      }}>
        <div style={{
          width: 200,
          height: 80,
          overflow: 'hidden',
          backgroundColor: '#ffe0b2',
          padding: 8,
        }}>
          <div style={{width: 350, height: 150, backgroundColor: '#e67e22'}} />
        </div>
      </div>

      {/* Three levels of overflow:hidden nesting */}
      <div style={{
        width: 300,
        height: 140,
        overflow: 'hidden',
        backgroundColor: '#f5f0ff',
        marginBottom: 12,
        padding: 8,
      }}>
        <div style={{
          width: 260,
          height: 110,
          overflow: 'hidden',
          backgroundColor: '#e8d5f5',
          padding: 8,
        }}>
          <div style={{
            width: 220,
            height: 80,
            overflow: 'hidden',
            backgroundColor: '#d1b3e8',
            padding: 8,
          }}>
            <div style={{width: 400, height: 200, backgroundColor: '#9b59b6'}} />
          </div>
        </div>
      </div>

      {/* overflow:hidden on flex container with overflowing flex children */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 300,
        height: 80,
        overflow: 'hidden',
        backgroundColor: '#f8cecc',
        marginBottom: 12,
        padding: 8,
        gap: 8,
      }}>
        <div style={{width: 150, height: 120, backgroundColor: '#d94a4a'}} />
        <div style={{width: 150, height: 120, backgroundColor: '#e57373'}} />
        <div style={{width: 150, height: 120, backgroundColor: '#ef9a9a'}} />
      </div>

      {/* Nested overflow:hidden with borderRadius at different levels */}
      <div style={{
        width: 250,
        height: 120,
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: '#e8f5e9',
        padding: 8,
      }}>
        <div style={{
          width: 230,
          height: 100,
          overflow: 'hidden',
          borderRadius: 8,
          backgroundColor: '#c8e6c9',
          padding: 8,
        }}>
          <div style={{width: 350, height: 150, backgroundColor: '#81c784'}} />
        </div>
      </div>
    </div>
  );
};
