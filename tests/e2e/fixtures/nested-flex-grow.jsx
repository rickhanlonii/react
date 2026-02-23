'use strict';

var React = require('react');

module.exports = function NestedFlexGrow() {
  return (
    <div style={{padding: 8}}>
      {/* Outer row with grow, inner column with grow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        height: 150,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: '#dae8fc',
          padding: 4,
        }}>
          <div style={{flexGrow: 1, backgroundColor: '#4a90d9'}} />
          <div style={{flexGrow: 2, backgroundColor: '#87ceeb'}} />
        </div>
        <div style={{
          flexGrow: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: '#d5e8d4',
          padding: 4,
        }}>
          <div style={{flexGrow: 1, backgroundColor: '#5ba55b'}} />
          <div style={{flexGrow: 1, backgroundColor: '#27ae60'}} />
          <div style={{flexGrow: 1, backgroundColor: '#1abc9c'}} />
        </div>
      </div>

      {/* Three levels: row > column > row, all with grow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        height: 180,
        backgroundColor: '#e8e8e8',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: '#f8cecc',
          padding: 4,
        }}>
          <div style={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'row',
            gap: 4,
          }}>
            <div style={{flexGrow: 1, backgroundColor: '#d94a4a'}} />
            <div style={{flexGrow: 1, backgroundColor: '#e57373'}} />
          </div>
          <div style={{flexGrow: 1, backgroundColor: '#ef9a9a'}} />
        </div>
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: '#dae8fc',
          padding: 4,
        }}>
          <div style={{flexGrow: 2, backgroundColor: '#4a90d9'}} />
          <div style={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'row',
            gap: 4,
          }}>
            <div style={{flexGrow: 2, backgroundColor: '#87ceeb'}} />
            <div style={{flexGrow: 1, backgroundColor: '#b3e5fc'}} />
          </div>
        </div>
      </div>

      {/* Grow with fixed siblings at each level */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        height: 120,
        backgroundColor: '#f5f0ff',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 60, backgroundColor: '#9b59b6'}} />
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{height: 30, backgroundColor: '#e8d5f5'}} />
          <div style={{flexGrow: 1, backgroundColor: '#d1c4e9'}} />
        </div>
        <div style={{width: 60, backgroundColor: '#7d3c98'}} />
      </div>

      {/* Equal grow at every level */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        height: 200,
        backgroundColor: '#fff3cd',
        padding: 8,
        gap: 8,
      }}>
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
        }}>
          <div style={{flexGrow: 1, backgroundColor: '#e67e22'}} />
          <div style={{flexGrow: 1, backgroundColor: '#f39c12'}} />
          <div style={{flexGrow: 1, backgroundColor: '#f1c40f'}} />
        </div>
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
        }}>
          <div style={{flexGrow: 1, backgroundColor: '#d94a4a'}} />
          <div style={{flexGrow: 1, backgroundColor: '#5ba55b'}} />
        </div>
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
        }}>
          <div style={{flexGrow: 1, backgroundColor: '#4a90d9'}} />
          <div style={{flexGrow: 1, backgroundColor: '#9b59b6'}} />
          <div style={{flexGrow: 1, backgroundColor: '#1abc9c'}} />
          <div style={{flexGrow: 1, backgroundColor: '#e67e22'}} />
        </div>
      </div>
    </div>
  );
};
