'use strict';

var React = require('react');

module.exports = function FlexAlignContentWrap() {
  return (
    <div style={{padding: 8}}>
      {/* alignContent: center + alignItems: flex-start */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'center',
        alignItems: 'flex-start',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 45, backgroundColor: '#9b59b6'}} />
      </div>

      {/* alignContent: space-between + alignItems: center */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'space-between',
        alignItems: 'center',
        width: 374,
        height: 200,
        backgroundColor: '#dae8fc',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 45, backgroundColor: '#9b59b6'}} />
      </div>

      {/* alignContent: flex-end + alignItems: stretch */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'flex-end',
        alignItems: 'stretch',
        width: 374,
        height: 200,
        backgroundColor: '#d5e8d4',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, backgroundColor: '#27ae60'}} />
        <div style={{width: 100, backgroundColor: '#1abc9c'}} />
        <div style={{width: 100, backgroundColor: '#16a085'}} />
        <div style={{width: 100, backgroundColor: '#2ecc71'}} />
      </div>

      {/* alignContent: space-around + alignItems: flex-end */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'space-around',
        alignItems: 'flex-end',
        width: 374,
        height: 200,
        backgroundColor: '#fff3cd',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#f1c40f'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#9b59b6'}} />
        <div style={{width: 100, height: 45, backgroundColor: '#4a90d9'}} />
      </div>

      {/* alignContent: stretch (default) with no explicit child height */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'stretch',
        width: 374,
        height: 200,
        backgroundColor: '#f5f0ff',
        padding: 8,
        gap: 8,
      }}>
        <div style={{width: 100, backgroundColor: '#9b59b6'}} />
        <div style={{width: 100, backgroundColor: '#8e44ad'}} />
        <div style={{width: 100, backgroundColor: '#7d3c98'}} />
        <div style={{width: 100, backgroundColor: '#6c3483'}} />
        <div style={{width: 100, backgroundColor: '#5b2c6f'}} />
        <div style={{width: 100, backgroundColor: '#4a235a'}} />
      </div>
    </div>
  );
};
