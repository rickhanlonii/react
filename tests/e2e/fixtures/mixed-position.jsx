'use strict';

var React = require('react');

module.exports = function MixedPosition() {
  return (
    <div style={{width: 390}}>
      {/* Relative parent with absolute child, sibling unaffected */}
      <div style={{
        position: 'relative',
        height: 100,
        backgroundColor: '#f0f0f0',
        padding: 10,
      }}>
        <div style={{height: 30, backgroundColor: '#cccccc'}} />
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 50,
          height: 50,
          backgroundColor: '#ff666666',
        }} />
        <div style={{height: 30, marginTop: 6, backgroundColor: '#bbbbbb'}} />
      </div>

      {/* Relative with offset + absolute child inside */}
      <div style={{
        position: 'relative',
        top: -10,
        height: 80,
        marginTop: 20,
        backgroundColor: '#eef0ee',
        padding: 8,
      }}>
        <p style={{fontSize: 14}}>Relative shifted up 10px</p>
        <div style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          width: 40,
          height: 25,
          backgroundColor: '#88aa88',
          borderRadius: 4,
        }} />
      </div>

      {/* Multiple absolute children stacked */}
      <div style={{
        position: 'relative',
        height: 120,
        marginTop: 12,
        backgroundColor: '#fff5ee',
      }}>
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 100,
          height: 60,
          backgroundColor: '#ffcccc',
          borderRadius: 4,
        }} />
        <div style={{
          position: 'absolute',
          top: 30,
          left: 50,
          width: 100,
          height: 60,
          backgroundColor: '#ccccff',
          borderRadius: 4,
        }} />
        <div style={{
          position: 'absolute',
          top: 50,
          left: 90,
          width: 100,
          height: 60,
          backgroundColor: '#ccffcc',
          borderRadius: 4,
        }} />
      </div>

      {/* Relative children in flex row — offsets don't affect siblings */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{
          flex: 1,
          height: 50,
          backgroundColor: '#ffaaaa',
          position: 'relative',
          top: -5,
        }} />
        <div style={{
          flex: 1,
          height: 50,
          backgroundColor: '#aaffaa',
        }} />
        <div style={{
          flex: 1,
          height: 50,
          backgroundColor: '#aaaaff',
          position: 'relative',
          top: 5,
        }} />
      </div>

      {/* Absolute inside relative inside relative */}
      <div style={{
        position: 'relative',
        marginTop: 12,
        padding: 10,
        backgroundColor: '#eeeedd',
      }}>
        <div style={{
          position: 'relative',
          left: 20,
          padding: 10,
          backgroundColor: '#ddddcc',
        }}>
          <div style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 30,
            height: 30,
            backgroundColor: '#aa8844',
          }} />
          <div style={{height: 40, backgroundColor: '#ccccbb'}} />
        </div>
      </div>
    </div>
  );
};
