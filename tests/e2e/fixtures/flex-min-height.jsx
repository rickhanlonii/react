'use strict';

var React = require('react');

module.exports = function FlexMinHeight() {
  return (
    <div style={{padding: 8}}>
      {/* minHeight on flex container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 200,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{height: 40, backgroundColor: '#5ba55b'}} />
      </div>

      {/* minHeight with flexGrow child filling remaining space */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 200,
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{flexGrow: 1, backgroundColor: '#87ceeb', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#4a90d9'}} />
      </div>

      {/* minHeight on flex children */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, minHeight: 80, backgroundColor: '#5ba55b'}} />
        <div style={{flex: 1, minHeight: 40, backgroundColor: '#27ae60'}} />
        <div style={{flex: 1, minHeight: 120, backgroundColor: '#1abc9c'}} />
      </div>

      {/* minHeight exceeded by content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 50,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e67e22', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#d94a4a', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#f1c40f', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#9b59b6'}} />
      </div>

      {/* minHeight + maxHeight on flex container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 100,
        maxHeight: 150,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
        overflow: 'hidden',
      }}>
        <div style={{height: 30, backgroundColor: '#9b59b6', marginBottom: 4}} />
        <div style={{flexGrow: 1, backgroundColor: '#e8d5f5'}} />
      </div>

      {/* Nested flex columns with minHeight */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 120,
          backgroundColor: '#fce4ec',
          padding: 8,
        }}>
          <div style={{height: 30, backgroundColor: '#d94a4a', marginBottom: 4}} />
          <div style={{flexGrow: 1, backgroundColor: '#e57373'}} />
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 80,
          backgroundColor: '#e8f5e9',
          padding: 8,
        }}>
          <div style={{height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
          <div style={{flexGrow: 1, backgroundColor: '#81c784'}} />
        </div>
      </div>
    </div>
  );
};
