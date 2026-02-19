'use strict';

var React = require('react');

module.exports = function MarginAuto() {
  return (
    <div style={{width: 390}}>
      {/* Horizontal centering with margin auto */}
      <div style={{
        width: 200,
        height: 50,
        marginLeft: 'auto',
        marginRight: 'auto',
        backgroundColor: '#ff9999',
      }} />

      {/* Right-aligned with marginLeft auto */}
      <div style={{
        width: 150,
        height: 50,
        marginLeft: 'auto',
        marginTop: 10,
        backgroundColor: '#99ff99',
      }} />

      {/* Left-aligned (default, marginRight auto) */}
      <div style={{
        width: 150,
        height: 50,
        marginRight: 'auto',
        marginTop: 10,
        backgroundColor: '#9999ff',
      }} />

      {/* Centering inside a flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        height: 80,
        marginTop: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{
          width: 60,
          height: 40,
          marginTop: 'auto',
          marginBottom: 'auto',
          backgroundColor: '#ffcc99',
        }} />
        <div style={{
          width: 60,
          height: 40,
          marginLeft: 'auto',
          backgroundColor: '#cc99ff',
        }} />
      </div>
    </div>
  );
};
