'use strict';

var React = require('react');

module.exports = function MinWidthInFlex() {
  return (
    <div style={{padding: 8}}>
      {/* minWidth prevents shrinking below minimum in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{minWidth: 200, height: 40, backgroundColor: '#4a90d9', marginRight: 8}} />
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#5ba55b'}} />
      </div>

      {/* minWidth on all flex children with flexShrink */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{flexGrow: 1, flexShrink: 1, minWidth: 100, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{flexGrow: 1, flexShrink: 1, minWidth: 100, height: 40, backgroundColor: '#27ae60'}} />
        <div style={{flexGrow: 1, flexShrink: 1, minWidth: 100, height: 40, backgroundColor: '#e67e22'}} />
      </div>

      {/* minWidth larger than flexBasis */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{flexBasis: 50, minWidth: 150, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#1abc9c'}} />
      </div>

      {/* minWidth with flexGrow: items grow but not below minimum */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{flexGrow: 1, minWidth: 200, height: 40, backgroundColor: '#e67e22'}} />
        <div style={{flexGrow: 3, minWidth: 50, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* minWidth in flex column (affects cross-axis) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
        gap: 4,
      }}>
        <div style={{minWidth: 300, height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{minWidth: 150, height: 30, backgroundColor: '#8e44ad'}} />
        <div style={{height: 30, backgroundColor: '#7d3c98'}} />
      </div>

      {/* minWidth 0 allowing full shrink vs default */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{width: 300, minWidth: 0, flexShrink: 1, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{width: 300, flexShrink: 1, height: 40, backgroundColor: '#e57373'}} />
      </div>

      {/* Nested flex with minWidth at different levels */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#e8f5e9',
        padding: 8,
        gap: 8,
      }}>
        <div style={{
          flex: 1,
          minWidth: 180,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#c8e6c9',
          padding: 8,
          gap: 4,
        }}>
          <div style={{minWidth: 100, height: 25, backgroundColor: '#5ba55b'}} />
          <div style={{height: 25, backgroundColor: '#27ae60'}} />
        </div>
        <div style={{
          flex: 1,
          minWidth: 80,
          height: 70,
          backgroundColor: '#81c784',
        }} />
      </div>
    </div>
  );
};
