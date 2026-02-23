'use strict';

var React = require('react');

module.exports = function MarginCollapseBlock() {
  return (
    <div style={{padding: 8}}>
      {/* Adjacent vertical margins between block siblings */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 20}} />
        <div style={{height: 30, backgroundColor: '#5ba55b', marginTop: 20}} />
      </div>

      {/* Different margin sizes between siblings */}
      <div style={{
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 30}} />
        <div style={{height: 30, backgroundColor: '#27ae60', marginTop: 10}} />
      </div>

      {/* Three siblings with margins */}
      <div style={{
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 25, backgroundColor: '#5ba55b', marginBottom: 16}} />
        <div style={{height: 25, backgroundColor: '#27ae60', marginTop: 16, marginBottom: 16}} />
        <div style={{height: 25, backgroundColor: '#1abc9c', marginTop: 16}} />
      </div>

      {/* Margin between parent and first child */}
      <div style={{
        width: 374,
        backgroundColor: '#fff3cd',
        marginTop: 20,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e67e22', marginTop: 20}} />
        <div style={{height: 30, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Margins in flex column (no collapse in flex) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#9b59b6', marginBottom: 20}} />
        <div style={{height: 30, backgroundColor: '#8e44ad', marginTop: 20}} />
      </div>

      {/* Block layout with gap vs margins */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 8,
      }}>
        {/* With gap */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          backgroundColor: '#f8cecc',
          padding: 8,
        }}>
          <div style={{height: 25, backgroundColor: '#d94a4a'}} />
          <div style={{height: 25, backgroundColor: '#e57373'}} />
          <div style={{height: 25, backgroundColor: '#ef9a9a'}} />
        </div>
        {/* With margins */}
        <div style={{
          flex: 1,
          backgroundColor: '#e8f5e9',
          padding: 8,
        }}>
          <div style={{height: 25, backgroundColor: '#5ba55b', marginBottom: 16}} />
          <div style={{height: 25, backgroundColor: '#81c784', marginBottom: 16}} />
          <div style={{height: 25, backgroundColor: '#a5d6a7'}} />
        </div>
      </div>
    </div>
  );
};
