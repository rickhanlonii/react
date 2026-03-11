'use strict';

var React = require('react');

module.exports = function RowGapColumn() {
  return (
    <div style={{padding: 8}}>
      {/* rowGap in column direction */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: 12,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Large rowGap in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: 24,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e67e22'}} />
        <div style={{height: 30, backgroundColor: '#9b59b6'}} />
      </div>

      {/* rowGap 0 in column (items touch) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: 0,
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{height: 30, backgroundColor: '#5ba55b'}} />
        <div style={{height: 30, backgroundColor: '#d94a4a'}} />
      </div>

      {/* columnGap has no effect in column direction */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        columnGap: 40,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{height: 30, backgroundColor: '#4a90d9'}} />
      </div>

      {/* rowGap + padding in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: 8,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 16,
        marginBottom: 8,
      }}>
        <div style={{height: 35, backgroundColor: '#5ba55b', borderRadius: 4}} />
        <div style={{height: 35, backgroundColor: '#27ae60', borderRadius: 4}} />
        <div style={{height: 35, backgroundColor: '#1abc9c', borderRadius: 4}} />
      </div>

      {/* rowGap with flexGrow children in fixed-height column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: 8,
        width: 374,
        height: 200,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{flexGrow: 1, backgroundColor: '#d94a4a'}} />
        <div style={{flexGrow: 2, backgroundColor: '#e67e22'}} />
        <div style={{flexGrow: 1, backgroundColor: '#f1c40f'}} />
      </div>
    </div>
  );
};
