'use strict';

var React = require('react');

module.exports = function FlexColumnWidth() {
  return (
    <div style={{padding: 8}}>
      {/* Default: children stretch to fill column width */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Children with explicit widths in column */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 200, height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{width: 100, height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{width: 300, height: 30, backgroundColor: '#d94a4a'}} />
      </div>

      {/* alignItems: center in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 200, height: 30, backgroundColor: '#e67e22', marginBottom: 4}} />
        <div style={{width: 100, height: 30, backgroundColor: '#d94a4a', marginBottom: 4}} />
        <div style={{width: 300, height: 30, backgroundColor: '#4a90d9'}} />
      </div>

      {/* alignItems: flex-end in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 150, height: 30, backgroundColor: '#9b59b6', marginBottom: 4}} />
        <div style={{width: 250, height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{width: 100, height: 30, backgroundColor: '#5ba55b'}} />
      </div>

      {/* Mixed: some children with explicit width, some stretch */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#e8e8e8',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{width: 200, height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#d94a4a'}} />
      </div>

      {/* alignSelf overrides in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 120, height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{width: 120, height: 30, backgroundColor: '#5ba55b', alignSelf: 'center', marginBottom: 4}} />
        <div style={{width: 120, height: 30, backgroundColor: '#d94a4a', alignSelf: 'flex-end', marginBottom: 4}} />
        <div style={{width: 120, height: 30, backgroundColor: '#e67e22', alignSelf: 'stretch'}} />
      </div>

      {/* Percentage widths in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{width: '100%', height: 25, backgroundColor: '#d94a4a', marginBottom: 4}} />
        <div style={{width: '75%', height: 25, backgroundColor: '#e67e22', marginBottom: 4}} />
        <div style={{width: '50%', height: 25, backgroundColor: '#f1c40f', marginBottom: 4}} />
        <div style={{width: '25%', height: 25, backgroundColor: '#5ba55b'}} />
      </div>
    </div>
  );
};
