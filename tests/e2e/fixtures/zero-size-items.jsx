'use strict';

var React = require('react');

module.exports = function ZeroSizeItems() {
  return (
    <div style={{width: 390}}>
      {/* Zero-width item in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        padding: 8,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{width: 0, height: 40, backgroundColor: '#000000'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9999ff'}} />
      </div>

      {/* Zero-height item in flex column */}
      <div style={{
        padding: 8,
        marginTop: 12,
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{height: 30, backgroundColor: '#ffaaaa'}} />
        <div style={{height: 0, marginTop: 8, backgroundColor: '#000000'}} />
        <div style={{height: 30, marginTop: 8, backgroundColor: '#aaaaff'}} />
      </div>

      {/* Zero-size with border (border still visible) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f5f5dc',
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#ddcc88'}} />
        <div style={{
          width: 0,
          height: 40,
          borderLeftWidth: 2,
          borderColor: '#cc0000',
        }} />
        <div style={{width: 60, height: 40, backgroundColor: '#88ccdd'}} />
      </div>

      {/* Zero-size with padding (padding creates size) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#eef0ee',
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#aaccaa'}} />
        <div style={{
          width: 0,
          height: 0,
          padding: 15,
          backgroundColor: '#ccaacc',
        }} />
        <div style={{width: 60, height: 40, backgroundColor: '#aacccc'}} />
      </div>

      {/* All zero-width items with flexGrow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        height: 40,
        marginTop: 12,
      }}>
        <div style={{width: 0, flexGrow: 1, backgroundColor: '#ffcccc'}} />
        <div style={{width: 0, flexGrow: 2, backgroundColor: '#ccffcc'}} />
        <div style={{width: 0, flexGrow: 1, backgroundColor: '#ccccff'}} />
      </div>
    </div>
  );
};
