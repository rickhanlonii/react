'use strict';

var React = require('react');

module.exports = function DisplayFlexNone() {
  return (
    <div style={{padding: 8}}>
      {/* Visible flex container */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Hidden flex container — siblings close up */}
      <div style={{
        display: 'none',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#e67e22'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#9b59b6'}} />
      </div>

      {/* This should be directly below the first box */}
      <div style={{
        width: 374,
        height: 30,
        backgroundColor: '#d5e8d4',
        marginBottom: 8,
      }} />

      {/* Hidden child in flex row — siblings fill space */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#5ba55b', display: 'none'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Hidden child in flex column — siblings close up */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{height: 30, backgroundColor: '#8e44ad', display: 'none'}} />
        <div style={{height: 30, backgroundColor: '#7d3c98'}} />
      </div>

      {/* Multiple hidden children */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#d94a4a', display: 'none'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#e67e22'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#f1c40f', display: 'none'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#5ba55b'}} />
      </div>

      {/* All children hidden — container collapses */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#e8e8e8',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#999999', display: 'none'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#888888', display: 'none'}} />
      </div>

      {/* After hidden container — verifies it takes no space */}
      <div style={{
        width: 374,
        height: 30,
        backgroundColor: '#1abc9c',
      }} />
    </div>
  );
};
