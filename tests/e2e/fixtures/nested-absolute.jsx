'use strict';

var React = require('react');

module.exports = function NestedAbsolute() {
  return (
    <div style={{padding: 8}}>
      {/* Absolute inside absolute */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 150,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 200,
          height: 120,
          backgroundColor: '#dae8fc',
          borderWidth: 1,
          borderColor: '#4a90d9',
        }}>
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            width: 80,
            height: 40,
            backgroundColor: '#4a90d9',
          }} />
          <div style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: 60,
            height: 30,
            backgroundColor: '#87ceeb',
          }} />
        </div>
      </div>

      {/* Three levels of absolute nesting */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 200,
        backgroundColor: '#d5e8d4',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 300,
          height: 170,
          backgroundColor: '#b8dab8',
          borderWidth: 1,
          borderColor: '#5ba55b',
        }}>
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            width: 200,
            height: 100,
            backgroundColor: '#8fca8f',
            borderWidth: 1,
            borderColor: '#27ae60',
          }}>
            <div style={{
              position: 'absolute',
              top: 10,
              left: 10,
              width: 80,
              height: 40,
              backgroundColor: '#5ba55b',
            }} />
          </div>
        </div>
      </div>

      {/* Absolute child positions relative to nearest positioned ancestor */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 150,
        backgroundColor: '#fff3cd',
        marginBottom: 8,
      }}>
        {/* Not positioned — absolute grandchild skips this */}
        <div style={{
          width: 300,
          height: 120,
          backgroundColor: '#ffe0b2',
          padding: 10,
          marginTop: 15,
          marginLeft: 15,
        }}>
          <div style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 50,
            height: 50,
            backgroundColor: '#e67e22',
            borderRadius: 4,
          }} />
        </div>
      </div>

      {/* Multiple absolute siblings at different nesting levels */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 120,
        backgroundColor: '#f5f0ff',
        marginBottom: 8,
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 100,
          height: 100,
          backgroundColor: '#e8d5f5',
          borderWidth: 1,
          borderColor: '#9b59b6',
        }}>
          <div style={{
            position: 'absolute',
            bottom: 5,
            right: 5,
            width: 30,
            height: 30,
            backgroundColor: '#9b59b6',
          }} />
        </div>
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 100,
          height: 100,
          backgroundColor: '#e8d5f5',
          borderWidth: 1,
          borderColor: '#8e44ad',
        }}>
          <div style={{
            position: 'absolute',
            top: 5,
            left: 5,
            width: 30,
            height: 30,
            backgroundColor: '#8e44ad',
          }} />
        </div>
      </div>

      {/* Absolute with overflow:hidden parent */}
      <div style={{
        position: 'relative',
        width: 374,
        height: 100,
        backgroundColor: '#f8cecc',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: -10,
          left: -10,
          width: 394,
          height: 120,
          backgroundColor: '#d94a4a',
          opacity: 0.3,
        }} />
        <div style={{
          position: 'absolute',
          top: 20,
          left: 20,
          width: 100,
          height: 60,
          backgroundColor: '#d94a4a',
          borderRadius: 8,
        }} />
      </div>
    </div>
  );
};
