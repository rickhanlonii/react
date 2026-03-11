'use strict';

var React = require('react');

module.exports = function FlexJustifyContentColumn() {
  return (
    <div style={{padding: 8}}>
      {/* justifyContent: flex-start (default) in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        width: 374,
        height: 150,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#e67e22'}} />
      </div>

      {/* justifyContent: flex-end in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        width: 374,
        height: 150,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#e67e22'}} />
      </div>

      {/* justifyContent: center in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: 374,
        height: 150,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#27ae60'}} />
      </div>

      {/* justifyContent: space-between in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: 374,
        height: 150,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e67e22'}} />
        <div style={{height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{height: 30, backgroundColor: '#f1c40f'}} />
      </div>

      {/* justifyContent: space-around in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        width: 374,
        height: 150,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 25, backgroundColor: '#9b59b6'}} />
        <div style={{height: 25, backgroundColor: '#8e44ad'}} />
        <div style={{height: 25, backgroundColor: '#7d3c98'}} />
      </div>

      {/* justifyContent: space-evenly in column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        width: 374,
        height: 150,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{height: 25, backgroundColor: '#d94a4a'}} />
        <div style={{height: 25, backgroundColor: '#e57373'}} />
        <div style={{height: 25, backgroundColor: '#ef9a9a'}} />
      </div>
    </div>
  );
};
