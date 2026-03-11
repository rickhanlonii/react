'use strict';

var React = require('react');

module.exports = function MarginInFlex() {
  return (
    <div style={{padding: 8}}>
      {/* Margins in flex row don't collapse */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#4a90d9', marginRight: 12}} />
        <div style={{width: 60, height: 40, backgroundColor: '#5ba55b', marginLeft: 12, marginRight: 12}} />
        <div style={{width: 60, height: 40, backgroundColor: '#d94a4a', marginLeft: 12}} />
      </div>

      {/* Margins in flex column don't collapse (unlike block) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 16}} />
        <div style={{height: 30, backgroundColor: '#5ba55b', marginTop: 16, marginBottom: 16}} />
        <div style={{height: 30, backgroundColor: '#d94a4a', marginTop: 16}} />
      </div>

      {/* Margin + gap in flex row (both apply) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#e67e22', marginRight: 8}} />
        <div style={{width: 60, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#9b59b6', marginLeft: 8}} />
      </div>

      {/* Asymmetric margins in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#5ba55b',
          marginRight: 4,
        }} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#27ae60',
          marginLeft: 4,
          marginRight: 16,
        }} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#1abc9c',
          marginLeft: 16,
        }} />
      </div>

      {/* Vertical margins in flex column with different sizes */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#9b59b6', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#8e44ad', marginBottom: 12}} />
        <div style={{height: 30, backgroundColor: '#7d3c98', marginBottom: 24}} />
        <div style={{height: 30, backgroundColor: '#6c3483'}} />
      </div>

      {/* Margin on cross-axis in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#e67e22', marginTop: 10}} />
        <div style={{width: 60, height: 40, backgroundColor: '#f1c40f', marginTop: 20}} />
        <div style={{width: 60, height: 40, backgroundColor: '#5ba55b', marginBottom: 10}} />
      </div>
    </div>
  );
};
