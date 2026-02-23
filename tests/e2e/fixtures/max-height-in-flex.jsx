'use strict';

var React = require('react');

module.exports = function MaxHeightInFlex() {
  return (
    <div style={{padding: 8}}>
      {/* maxHeight on flex column container limits total height */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 100,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
        overflow: 'hidden',
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{height: 40, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 40, backgroundColor: '#e67e22'}} />
      </div>

      {/* maxHeight on flex children in row — limits cross-axis */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{flex: 1, height: 120, maxHeight: 60, backgroundColor: '#4a90d9'}} />
        <div style={{flex: 1, height: 120, backgroundColor: '#27ae60'}} />
        <div style={{flex: 1, height: 120, maxHeight: 80, backgroundColor: '#e67e22'}} />
      </div>

      {/* maxHeight on flex children in column — limits main-axis */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
        gap: 4,
      }}>
        <div style={{height: 80, maxHeight: 30, backgroundColor: '#5ba55b'}} />
        <div style={{height: 80, maxHeight: 50, backgroundColor: '#27ae60'}} />
        <div style={{height: 40, backgroundColor: '#1abc9c'}} />
      </div>

      {/* maxHeight with flexGrow — grow limited by maxHeight */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 200,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
        gap: 4,
      }}>
        <div style={{flexGrow: 1, maxHeight: 40, backgroundColor: '#e67e22'}} />
        <div style={{flexGrow: 1, backgroundColor: '#d94a4a'}} />
        <div style={{flexGrow: 1, maxHeight: 40, backgroundColor: '#f1c40f'}} />
      </div>

      {/* maxHeight + minHeight together on flex child */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 200,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
        gap: 4,
      }}>
        <div style={{flexGrow: 1, minHeight: 30, maxHeight: 60, backgroundColor: '#9b59b6'}} />
        <div style={{flexGrow: 1, backgroundColor: '#8e44ad'}} />
        <div style={{height: 40, backgroundColor: '#7d3c98'}} />
      </div>

      {/* maxHeight on nested flex containers */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
        gap: 8,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 100,
          backgroundColor: '#fce4ec',
          padding: 8,
          gap: 4,
          overflow: 'hidden',
        }}>
          <div style={{height: 30, backgroundColor: '#d94a4a'}} />
          <div style={{height: 30, backgroundColor: '#e57373'}} />
          <div style={{height: 30, backgroundColor: '#ef9a9a'}} />
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#e8f5e9',
          padding: 8,
          gap: 4,
        }}>
          <div style={{height: 30, backgroundColor: '#5ba55b'}} />
          <div style={{height: 30, backgroundColor: '#81c784'}} />
          <div style={{height: 30, backgroundColor: '#a5d6a7'}} />
        </div>
      </div>
    </div>
  );
};
