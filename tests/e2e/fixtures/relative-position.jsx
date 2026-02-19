'use strict';

var React = require('react');

module.exports = function RelativePosition() {
  return (
    <div>
      {/* Relative with top/left offset */}
      <div style={{
        width: 300,
        height: 60,
        backgroundColor: '#eeeeee',
        padding: 10,
      }}>
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#ff9999',
          position: 'relative',
          top: 10,
          left: 20,
        }} />
      </div>
      {/* Relative with negative offsets */}
      <div style={{
        width: 300,
        height: 60,
        backgroundColor: '#dddddd',
        padding: 10,
        marginTop: 10,
      }}>
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#99ff99',
          position: 'relative',
          top: -5,
          left: -10,
        }} />
      </div>
      {/* Relative does not affect siblings */}
      <div style={{
        width: 300,
        backgroundColor: '#cccccc',
        padding: 10,
        marginTop: 10,
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#9999ff'}} />
        <div style={{
          width: 60,
          height: 40,
          backgroundColor: '#ffcc99',
          position: 'relative',
          top: 15,
          left: 10,
        }} />
        <div style={{width: 60, height: 40, backgroundColor: '#cc99ff'}} />
      </div>
    </div>
  );
};
