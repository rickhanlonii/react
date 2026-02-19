'use strict';

var React = require('react');

module.exports = function PositionAbsolute() {
  return (
    <div style={{width: 300, height: 200, backgroundColor: '#eeeeee', position: 'relative'}}>
      <div style={{
        width: 60,
        height: 60,
        backgroundColor: '#ff9999',
        position: 'absolute',
        top: 10,
        left: 10,
      }} />
      <div style={{
        width: 60,
        height: 60,
        backgroundColor: '#99ff99',
        position: 'absolute',
        top: 10,
        right: 10,
      }} />
      <div style={{
        width: 60,
        height: 60,
        backgroundColor: '#9999ff',
        position: 'absolute',
        bottom: 10,
        left: 10,
      }} />
      <div style={{
        width: 80,
        height: 30,
        backgroundColor: '#ffcc99',
        position: 'absolute',
        bottom: 10,
        right: 10,
      }} />
    </div>
  );
};
