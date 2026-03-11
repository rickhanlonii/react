'use strict';

var React = require('react');

module.exports = function PaddingOnlySizing() {
  return (
    <div style={{padding: 10}}>
      {/* Padding-only box (no width/height) */}
      <div style={{padding: 20, backgroundColor: '#4a90d9', marginBottom: 10}}>
        <span style={{color: '#ffffff', fontSize: 12}}>20px padding all sides</span>
      </div>

      {/* Different padding per side */}
      <div style={{paddingTop: 10, paddingRight: 30, paddingBottom: 40, paddingLeft: 15, backgroundColor: '#50c878', marginBottom: 10}}>
        <span style={{color: '#ffffff', fontSize: 12}}>T:10 R:30 B:40 L:15</span>
      </div>

      {/* Padding-only empty box (pure padding, no content) */}
      <div style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
        <div style={{padding: 15, backgroundColor: '#e74c3c'}} />
        <div style={{padding: 25, backgroundColor: '#f39c12'}} />
        <div style={{paddingTop: 30, paddingLeft: 10, backgroundColor: '#9b59b6'}} />
      </div>

      {/* Padding with border (both add to size) */}
      <div style={{padding: 16, borderWidth: 2, borderColor: '#333333', backgroundColor: '#eeeeee', marginBottom: 10}}>
        <span style={{fontSize: 12}}>padding 16 + border 2</span>
      </div>

      {/* Nested padding accumulation */}
      <div style={{padding: 12, backgroundColor: '#dddddd', marginBottom: 10}}>
        <div style={{padding: 12, backgroundColor: '#bbbbbb'}}>
          <div style={{padding: 12, backgroundColor: '#999999'}}>
            <span style={{color: '#ffffff', fontSize: 11}}>3 levels of padding</span>
          </div>
        </div>
      </div>

      {/* Padding-only in flex row */}
      <div style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
        <div style={{padding: 10, backgroundColor: '#4a90d9'}}>
          <span style={{color: '#ffffff', fontSize: 10}}>A</span>
        </div>
        <div style={{padding: 20, backgroundColor: '#50c878'}}>
          <span style={{color: '#ffffff', fontSize: 10}}>B</span>
        </div>
        <div style={{padding: 15, backgroundColor: '#e74c3c'}}>
          <span style={{color: '#ffffff', fontSize: 10}}>C</span>
        </div>
      </div>

      {/* Horizontal padding only (no vertical) */}
      <div style={{paddingLeft: 20, paddingRight: 20, backgroundColor: '#f39c12', marginBottom: 10}}>
        <span style={{color: '#ffffff', fontSize: 12}}>horizontal padding only</span>
      </div>

      {/* Vertical padding only (no horizontal) */}
      <div style={{paddingTop: 20, paddingBottom: 20, backgroundColor: '#9b59b6'}}>
        <span style={{color: '#ffffff', fontSize: 12}}>vertical padding only</span>
      </div>
    </div>
  );
};
