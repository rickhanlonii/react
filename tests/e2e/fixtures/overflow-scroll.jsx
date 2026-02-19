'use strict';

var React = require('react');

module.exports = function OverflowScroll() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Vertical scroll — content taller than container */}
      <div style={{
        height: 120,
        overflow: 'scroll',
        backgroundColor: '#f0f0f0',
        padding: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#ff9999', marginBottom: 8}} />
        <div style={{height: 40, backgroundColor: '#99ff99', marginBottom: 8}} />
        <div style={{height: 40, backgroundColor: '#9999ff', marginBottom: 8}} />
        <div style={{height: 40, backgroundColor: '#ffff99', marginBottom: 8}} />
        <div style={{height: 40, backgroundColor: '#ff99ff'}} />
      </div>

      {/* Horizontal scroll — content wider than container */}
      <div style={{
        height: 80,
        marginTop: 16,
        overflow: 'scroll',
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          width: 800,
        }}>
          <div style={{width: 150, height: 60, backgroundColor: '#ffaaaa', margin: 4}} />
          <div style={{width: 150, height: 60, backgroundColor: '#aaffaa', margin: 4}} />
          <div style={{width: 150, height: 60, backgroundColor: '#aaaaff', margin: 4}} />
          <div style={{width: 150, height: 60, backgroundColor: '#ffffaa', margin: 4}} />
        </div>
      </div>

      {/* Scroll with text content */}
      <div style={{
        height: 80,
        marginTop: 16,
        overflow: 'scroll',
        padding: 8,
        backgroundColor: '#fff8e8',
        borderWidth: 1,
        borderColor: '#cccccc',
      }}>
        <p>Line one of scrollable text.</p>
        <p>Line two of scrollable text.</p>
        <p>Line three of scrollable text.</p>
        <p>Line four of scrollable text.</p>
        <p>Line five of scrollable text.</p>
      </div>

      {/* No overflow — content fits, scroll has no effect */}
      <div style={{
        height: 80,
        marginTop: 16,
        overflow: 'scroll',
        backgroundColor: '#e8f8e8',
        padding: 8,
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#66cc66'}} />
      </div>
    </div>
  );
};
