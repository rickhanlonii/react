'use strict';

var React = require('react');

module.exports = function GapProperties() {
  return (
    <div>
      {/* rowGap only (column direction) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: 12,
        padding: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{height: 30, backgroundColor: '#ff9999'}} />
        <div style={{height: 30, backgroundColor: '#99ff99'}} />
        <div style={{height: 30, backgroundColor: '#9999ff'}} />
      </div>
      {/* columnGap only (row direction) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        columnGap: 16,
        padding: 10,
        backgroundColor: '#dddddd',
        marginTop: 10,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#ffcc99'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#cc99ff'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#99ccff'}} />
      </div>
      {/* rowGap and columnGap different (wrapping row) */}
      <div style={{
        width: 200,
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 20,
        columnGap: 8,
        padding: 10,
        backgroundColor: '#cccccc',
        marginTop: 10,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#99ff99'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9999ff'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#ffcc99'}} />
      </div>
    </div>
  );
};
