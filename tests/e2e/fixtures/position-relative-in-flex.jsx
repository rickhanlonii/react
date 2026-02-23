'use strict';

var React = require('react');

module.exports = function PositionRelativeInFlex() {
  return (
    <div style={{padding: 8}}>
      {/* Relative offset on flex row child */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#5ba55b',
          position: 'relative',
          top: 10,
          left: 5,
        }} />
        <div style={{width: 60, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Relative offset doesn't affect siblings */}
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
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#87ceeb',
          position: 'relative',
          top: -10,
        }} />
        <div style={{flex: 1, height: 40, backgroundColor: '#4a90d9'}} />
      </div>

      {/* Relative offset on flex column child */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#5ba55b'}} />
        <div style={{
          height: 30,
          backgroundColor: '#27ae60',
          position: 'relative',
          left: 20,
        }} />
        <div style={{height: 30, backgroundColor: '#1abc9c'}} />
      </div>

      {/* Multiple children with different offsets */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#e67e22',
          position: 'relative',
          top: 0,
        }} />
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#d94a4a',
          position: 'relative',
          top: 8,
        }} />
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#9b59b6',
          position: 'relative',
          top: 16,
        }} />
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#4a90d9',
          position: 'relative',
          top: 24,
        }} />
      </div>

      {/* Relative + flexGrow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#9b59b6'}} />
        <div style={{
          flexGrow: 2,
          height: 40,
          backgroundColor: '#8e44ad',
          position: 'relative',
          top: -5,
          left: 3,
        }} />
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#7d3c98'}} />
      </div>

      {/* Relative in wrapping flex */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{
          width: 100,
          height: 40,
          backgroundColor: '#e67e22',
          position: 'relative',
          top: 5,
          left: 5,
        }} />
        <div style={{width: 100, height: 40, backgroundColor: '#f1c40f'}} />
        <div style={{
          width: 100,
          height: 40,
          backgroundColor: '#5ba55b',
          position: 'relative',
          top: -5,
        }} />
        <div style={{width: 100, height: 40, backgroundColor: '#4a90d9'}} />
      </div>
    </div>
  );
};
