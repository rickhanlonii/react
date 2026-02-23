'use strict';

var React = require('react');

module.exports = function OverflowScrollFlex() {
  return (
    <div style={{padding: 10}}>
      {/* Vertical scroll in flex column */}
      <div style={{height: 120, overflow: 'scroll', backgroundColor: '#eeeeee', marginBottom: 10, padding: 8}}>
        <div style={{height: 40, backgroundColor: '#4a90d9', marginBottom: 6}} />
        <div style={{height: 40, backgroundColor: '#50c878', marginBottom: 6}} />
        <div style={{height: 40, backgroundColor: '#e74c3c', marginBottom: 6}} />
        <div style={{height: 40, backgroundColor: '#f39c12', marginBottom: 6}} />
        <div style={{height: 40, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Horizontal scroll in flex row */}
      <div style={{flexDirection: 'row', height: 60, overflow: 'scroll', backgroundColor: '#dddddd', marginBottom: 10, padding: 8}}>
        <div style={{width: 100, height: 44, backgroundColor: '#4a90d9', marginRight: 6, flexShrink: 0}} />
        <div style={{width: 100, height: 44, backgroundColor: '#50c878', marginRight: 6, flexShrink: 0}} />
        <div style={{width: 100, height: 44, backgroundColor: '#e74c3c', marginRight: 6, flexShrink: 0}} />
        <div style={{width: 100, height: 44, backgroundColor: '#f39c12', flexShrink: 0}} />
      </div>

      {/* Scroll container with flexGrow children */}
      <div style={{height: 100, overflow: 'scroll', backgroundColor: '#eeeeee', marginBottom: 10, padding: 8}}>
        <div style={{flexGrow: 1, minHeight: 50, backgroundColor: '#4a90d9', marginBottom: 6}} />
        <div style={{flexGrow: 2, minHeight: 80, backgroundColor: '#50c878', marginBottom: 6}} />
        <div style={{flexGrow: 1, minHeight: 50, backgroundColor: '#e74c3c'}} />
      </div>

      {/* Scroll inside flex item */}
      <div style={{flexDirection: 'row', height: 100, gap: 8, marginBottom: 10}}>
        <div style={{flex: 1, backgroundColor: '#4a90d9', padding: 6}}>
          <span style={{color: '#ffffff', fontSize: 11}}>Fixed</span>
        </div>
        <div style={{flex: 2, overflow: 'scroll', backgroundColor: '#eeeeee', padding: 6}}>
          <div style={{height: 30, backgroundColor: '#50c878', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#e74c3c', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#f39c12', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#9b59b6'}} />
        </div>
      </div>

      {/* Nested scroll containers */}
      <div style={{height: 120, overflow: 'scroll', backgroundColor: '#dddddd', padding: 8}}>
        <div style={{height: 80, overflow: 'scroll', backgroundColor: '#eeeeee', padding: 6, marginBottom: 6}}>
          <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#50c878', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#e74c3c'}} />
        </div>
        <div style={{height: 60, backgroundColor: '#f39c12'}} />
      </div>
    </div>
  );
};
