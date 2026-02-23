'use strict';

var React = require('react');

module.exports = function NestedPercentage() {
  return (
    <div style={{padding: 8}}>
      {/* 50% of 50% = 25% of root */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: '50%',
          backgroundColor: '#dae8fc',
          padding: 8,
        }}>
          <div style={{
            width: '50%',
            height: 30,
            backgroundColor: '#4a90d9',
          }} />
        </div>
      </div>

      {/* 75% of 66% */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: '66%',
          backgroundColor: '#d5e8d4',
          padding: 8,
        }}>
          <div style={{
            width: '75%',
            height: 30,
            backgroundColor: '#5ba55b',
          }} />
        </div>
      </div>

      {/* Three levels of nesting: 80% > 50% > 100% */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: '80%',
          backgroundColor: '#fff3cd',
          padding: 8,
        }}>
          <div style={{
            width: '50%',
            backgroundColor: '#ffe0b2',
            padding: 8,
          }}>
            <div style={{
              width: '100%',
              height: 30,
              backgroundColor: '#e67e22',
            }} />
          </div>
        </div>
      </div>

      {/* Percentage height requires explicit parent height */}
      <div style={{
        width: 374,
        height: 200,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: '100%',
          height: '50%',
          backgroundColor: '#e8d5f5',
          padding: 8,
        }}>
          <div style={{
            width: '50%',
            height: '100%',
            backgroundColor: '#9b59b6',
          }} />
        </div>
      </div>

      {/* Percentage in flex row children */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{
          width: '30%',
          backgroundColor: '#fce4ec',
          padding: 8,
        }}>
          <div style={{width: '100%', height: 30, backgroundColor: '#d94a4a'}} />
        </div>
        <div style={{
          width: '70%',
          backgroundColor: '#fce4ec',
          padding: 8,
        }}>
          <div style={{width: '50%', height: 30, backgroundColor: '#e67e22'}} />
        </div>
      </div>

      {/* Side-by-side: different percentage depths */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 8,
        backgroundColor: '#e8e8e8',
        padding: 8,
      }}>
        <div style={{flex: 1, backgroundColor: '#ffffff', padding: 8}}>
          <div style={{width: '80%', height: 25, backgroundColor: '#4a90d9', marginBottom: 4}} />
          <div style={{width: '60%', height: 25, backgroundColor: '#5ba55b', marginBottom: 4}} />
          <div style={{width: '40%', height: 25, backgroundColor: '#d94a4a'}} />
        </div>
        <div style={{flex: 1, backgroundColor: '#ffffff', padding: 8}}>
          <div style={{width: '40%', height: 25, backgroundColor: '#d94a4a', marginBottom: 4}} />
          <div style={{width: '60%', height: 25, backgroundColor: '#5ba55b', marginBottom: 4}} />
          <div style={{width: '80%', height: 25, backgroundColor: '#4a90d9'}} />
        </div>
      </div>
    </div>
  );
};
