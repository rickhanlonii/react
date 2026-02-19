'use strict';

var React = require('react');

module.exports = function BorderRadius() {
  return (
    <div style={{width: 390}}>
      {/* Uniform border radius */}
      <div style={{
        width: 100,
        height: 100,
        borderRadius: 10,
        backgroundColor: '#ff9999',
      }} />

      {/* Circle (border radius = half of width/height) */}
      <div style={{
        width: 80,
        height: 80,
        borderRadius: 40,
        marginTop: 10,
        backgroundColor: '#99ff99',
      }} />

      {/* Per-corner border radius */}
      <div style={{
        width: 120,
        height: 80,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 20,
        borderBottomLeftRadius: 0,
        marginTop: 10,
        backgroundColor: '#9999ff',
      }} />

      {/* Border radius with border */}
      <div style={{
        width: 100,
        height: 60,
        borderRadius: 12,
        borderWidth: 3,
        borderStyle: 'solid',
        borderColor: '#333333',
        marginTop: 10,
        backgroundColor: '#ffcc99',
      }} />

      {/* Pill shape (large radius on short element) */}
      <div style={{
        width: 200,
        height: 40,
        borderRadius: 20,
        marginTop: 10,
        backgroundColor: '#cc99ff',
      }} />
    </div>
  );
};
