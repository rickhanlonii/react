'use strict';

var React = require('react');

module.exports = function FlexGrowShrinkCombo() {
  return (
    <div style={{padding: 8}}>
      {/* flexGrow + flexShrink on same items */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 100,
          height: 40,
          backgroundColor: '#4a90d9',
          marginRight: 4,
        }} />
        <div style={{
          flexGrow: 2,
          flexShrink: 1,
          flexBasis: 100,
          height: 40,
          backgroundColor: '#5ba55b',
          marginRight: 4,
        }} />
        <div style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 100,
          height: 40,
          backgroundColor: '#d94a4a',
        }} />
      </div>

      {/* One item won't shrink (flexShrink: 0), others do */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 200,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexShrink: 0,
          width: 80,
          height: 40,
          backgroundColor: '#e67e22',
          marginRight: 4,
        }} />
        <div style={{
          flexShrink: 1,
          width: 80,
          height: 40,
          backgroundColor: '#9b59b6',
          marginRight: 4,
        }} />
        <div style={{
          flexShrink: 1,
          width: 80,
          height: 40,
          backgroundColor: '#1abc9c',
        }} />
      </div>

      {/* flexGrow 0 + flexShrink 0 = fixed size */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexGrow: 0,
          flexShrink: 0,
          width: 60,
          height: 40,
          backgroundColor: '#4a90d9',
          marginRight: 4,
        }} />
        <div style={{
          flexGrow: 1,
          flexShrink: 1,
          height: 40,
          backgroundColor: '#5ba55b',
          marginRight: 4,
        }} />
        <div style={{
          flexGrow: 0,
          flexShrink: 0,
          width: 60,
          height: 40,
          backgroundColor: '#d94a4a',
        }} />
      </div>

      {/* Different shrink ratios (1:3) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 200,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexShrink: 1,
          width: 120,
          height: 40,
          backgroundColor: '#9b59b6',
          marginRight: 4,
        }} />
        <div style={{
          flexShrink: 3,
          width: 120,
          height: 40,
          backgroundColor: '#4a90d9',
        }} />
      </div>

      {/* Column: grow + shrink combo */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        height: 200,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flexGrow: 0,
          flexShrink: 0,
          height: 40,
          backgroundColor: '#5ba55b',
          marginBottom: 4,
        }} />
        <div style={{
          flexGrow: 1,
          flexShrink: 1,
          backgroundColor: '#27ae60',
          marginBottom: 4,
        }} />
        <div style={{
          flexGrow: 0,
          flexShrink: 0,
          height: 40,
          backgroundColor: '#1abc9c',
        }} />
      </div>

      {/* Grow from different bases with gap */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 8,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{
          flexGrow: 1,
          flexBasis: 0,
          height: 40,
          backgroundColor: '#d94a4a',
        }} />
        <div style={{
          flexGrow: 1,
          flexBasis: 50,
          height: 40,
          backgroundColor: '#e67e22',
        }} />
        <div style={{
          flexGrow: 1,
          flexBasis: 100,
          height: 40,
          backgroundColor: '#f1c40f',
        }} />
      </div>
    </div>
  );
};
