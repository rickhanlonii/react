'use strict';

var React = require('react');

module.exports = function FlexReverseGap() {
  return (
    <div style={{padding: 8}}>
      {/* row-reverse with gap */}
      <div style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        gap: 12,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* row (normal) with same gap for comparison */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* column-reverse with gap */}
      <div style={{
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{height: 30, backgroundColor: '#5ba55b'}} />
        <div style={{height: 30, backgroundColor: '#d94a4a'}} />
      </div>

      {/* row-reverse with gap and flexGrow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        gap: 8,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{flexGrow: 2, height: 40, backgroundColor: '#27ae60'}} />
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#1abc9c'}} />
      </div>

      {/* column-reverse with gap and flexGrow in fixed height */}
      <div style={{
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        width: 374,
        height: 200,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flexGrow: 1, backgroundColor: '#e67e22'}} />
        <div style={{height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{flexGrow: 1, backgroundColor: '#f1c40f'}} />
      </div>

      {/* row-reverse with gap and different rowGap/columnGap */}
      <div style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        rowGap: 16,
        columnGap: 8,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#9b59b6'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#8e44ad'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#7d3c98'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#6c3483'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#5b2c6f'}} />
      </div>
    </div>
  );
};
