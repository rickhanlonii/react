'use strict';

var React = require('react');

module.exports = function FlexWrapGapSizes() {
  return (
    <div style={{padding: 8}}>
      {/* Items that wrap at different points */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 180, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 180, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{width: 180, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Many small items wrapping naturally */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 50, height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{width: 70, height: 30, backgroundColor: '#5ba55b'}} />
        <div style={{width: 40, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 90, height: 30, backgroundColor: '#e67e22'}} />
        <div style={{width: 60, height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{width: 80, height: 30, backgroundColor: '#1abc9c'}} />
        <div style={{width: 55, height: 30, backgroundColor: '#f1c40f'}} />
        <div style={{width: 65, height: 30, backgroundColor: '#e74c3c'}} />
      </div>

      {/* Large gap causing earlier wraps */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 24,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#27ae60'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#1abc9c'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#16a085'}} />
      </div>

      {/* Different heights in wrap rows */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 110, height: 60, backgroundColor: '#e67e22'}} />
        <div style={{width: 110, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 110, height: 45, backgroundColor: '#f1c40f'}} />
        <div style={{width: 110, height: 50, backgroundColor: '#9b59b6'}} />
        <div style={{width: 110, height: 35, backgroundColor: '#4a90d9'}} />
      </div>

      {/* Single item per row (wider than half container) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 350, height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{width: 350, height: 30, backgroundColor: '#8e44ad'}} />
        <div style={{width: 350, height: 30, backgroundColor: '#7d3c98'}} />
      </div>

      {/* Mixed: some rows have one item, some have multiple */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{width: 350, height: 30, backgroundColor: '#d94a4a'}} />
        <div style={{width: 170, height: 30, backgroundColor: '#e67e22'}} />
        <div style={{width: 170, height: 30, backgroundColor: '#f1c40f'}} />
        <div style={{width: 110, height: 30, backgroundColor: '#5ba55b'}} />
        <div style={{width: 110, height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{width: 110, height: 30, backgroundColor: '#9b59b6'}} />
      </div>
    </div>
  );
};
