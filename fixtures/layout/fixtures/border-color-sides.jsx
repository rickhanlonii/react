'use strict';

var React = require('react');

module.exports = function BorderColorSides() {
  return (
    <div style={{padding: 10}}>
      {/* All four sides different colors */}
      <div style={{
        width: 200,
        height: 100,
        borderWidth: 4,
        borderStyle: 'solid',
        borderTopColor: '#ff0000',
        borderRightColor: '#00ff00',
        borderBottomColor: '#0000ff',
        borderLeftColor: '#ff9900',
        backgroundColor: '#f5f5f5',
      }} />
      {/* Mixed: uniform color + one side override */}
      <div style={{
        width: 200,
        height: 80,
        borderWidth: 3,
        borderStyle: 'solid',
        borderColor: '#999999',
        borderTopColor: '#ff0000',
        backgroundColor: '#f0f0f0',
        marginTop: 10,
      }} />
      {/* Thick borders with per-side colors */}
      <div style={{
        width: 150,
        height: 150,
        borderTopWidth: 8,
        borderRightWidth: 4,
        borderBottomWidth: 8,
        borderLeftWidth: 4,
        borderStyle: 'solid',
        borderTopColor: '#333333',
        borderRightColor: '#666666',
        borderBottomColor: '#999999',
        borderLeftColor: '#cccccc',
        backgroundColor: '#ffffff',
        marginTop: 10,
      }} />
    </div>
  );
};
