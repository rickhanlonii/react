'use strict';

var React = require('react');

module.exports = function LargeGapValues() {
  return (
    <div style={{width: 390}}>
      {/* Large gap in row — items squeezed */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 50,
        padding: 8,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#99ff99'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9999ff'}} />
      </div>

      {/* Large gap in column */}
      <div style={{
        gap: 30,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{height: 25, backgroundColor: '#ffaaaa'}} />
        <div style={{height: 25, backgroundColor: '#aaffaa'}} />
        <div style={{height: 25, backgroundColor: '#aaaaff'}} />
      </div>

      {/* Gap + padding combined */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 20,
        padding: 20,
        marginTop: 12,
        backgroundColor: '#f5f5dc',
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#ddcc88'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#88ccdd'}} />
      </div>

      {/* rowGap large, columnGap small */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 30,
        columnGap: 4,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#eef0ee',
      }}>
        <div style={{width: 120, height: 30, backgroundColor: '#aaccaa'}} />
        <div style={{width: 120, height: 30, backgroundColor: '#ccaacc'}} />
        <div style={{width: 120, height: 30, backgroundColor: '#ccccaa'}} />
        <div style={{width: 120, height: 30, backgroundColor: '#aacccc'}} />
      </div>

      {/* columnGap large, rowGap small */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 4,
        columnGap: 40,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f0eef0',
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#ccaadd'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#aaddcc'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#ddccaa'}} />
        <div style={{width: 100, height: 30, backgroundColor: '#aaccdd'}} />
      </div>
    </div>
  );
};
