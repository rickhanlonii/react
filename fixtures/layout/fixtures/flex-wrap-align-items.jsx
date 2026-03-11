'use strict';

var React = require('react');

module.exports = function FlexWrapAlignItems() {
  return (
    <div style={{padding: 8}}>
      {/* Wrap with alignItems: stretch (default) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'stretch',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 60, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Wrap with alignItems: flex-start */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 60, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Wrap with alignItems: center */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 60, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Wrap with alignItems: flex-end */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 60, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#e67e22'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Wrap with alignSelf overrides per item */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 100, height: 60, backgroundColor: '#5ba55b', alignSelf: 'flex-end'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#d94a4a', alignSelf: 'center'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#e67e22', alignSelf: 'stretch'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Wrap with equal-height items (no cross-axis difference) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
        gap: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#e67e22'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#f1c40f'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#1abc9c'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#e74c3c'}} />
      </div>
    </div>
  );
};
