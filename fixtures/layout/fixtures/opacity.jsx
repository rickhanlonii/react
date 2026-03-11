'use strict';

var React = require('react');

module.exports = function Opacity() {
  return (
    <div style={{width: 390}}>
      {/* Full opacity (default) */}
      <div style={{
        width: 200,
        height: 50,
        backgroundColor: '#ff0000',
        opacity: 1,
      }} />

      {/* Half opacity */}
      <div style={{
        width: 200,
        height: 50,
        marginTop: 10,
        backgroundColor: '#ff0000',
        opacity: 0.5,
      }} />

      {/* Low opacity */}
      <div style={{
        width: 200,
        height: 50,
        marginTop: 10,
        backgroundColor: '#ff0000',
        opacity: 0.2,
      }} />

      {/* Opacity on container with children */}
      <div style={{
        padding: 10,
        marginTop: 10,
        backgroundColor: '#0000ff',
        opacity: 0.5,
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#ffff00'}} />
      </div>

      {/* Zero opacity (invisible but takes space) */}
      <div style={{
        width: 200,
        height: 50,
        marginTop: 10,
        backgroundColor: '#00ff00',
        opacity: 0,
      }} />
    </div>
  );
};
