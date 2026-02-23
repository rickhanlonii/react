'use strict';

var React = require('react');

module.exports = function SelfSizingText() {
  return (
    <div style={{padding: 8}}>
      {/* Div sized by text content (no explicit width/height) */}
      <div style={{
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{fontSize: 14}}>Short text</div>
      </div>

      {/* Multiple text children stacking vertically */}
      <div style={{
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{fontSize: 14}}>First line</div>
        <div style={{fontSize: 14}}>Second line</div>
        <div style={{fontSize: 14}}>Third line</div>
      </div>

      {/* Text with different font sizes affects height */}
      <div style={{
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{fontSize: 24, fontWeight: 'bold'}}>Large heading</div>
        <div style={{fontSize: 12, color: '#666666'}}>Small subtitle text</div>
      </div>

      {/* Flex row where children size to their text */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{backgroundColor: '#f8cecc', padding: 8}}>
          <div style={{fontSize: 12}}>A</div>
        </div>
        <div style={{backgroundColor: '#dae8fc', padding: 8}}>
          <div style={{fontSize: 12}}>Longer text here</div>
        </div>
        <div style={{backgroundColor: '#d5e8d4', padding: 8}}>
          <div style={{fontSize: 12}}>Mid</div>
        </div>
      </div>

      {/* Text with padding and border affecting total size */}
      <div style={{
        backgroundColor: '#e8e8e8',
        padding: 12,
        borderWidth: 2,
        borderColor: '#999999',
        marginBottom: 8,
      }}>
        <div style={{fontSize: 14}}>Text inside padded bordered container</div>
      </div>

      {/* Constrained width forces text to wrap, increasing height */}
      <div style={{
        width: 150,
        backgroundColor: '#f5f0ff',
        padding: 8,
        borderWidth: 1,
        borderColor: '#9b59b6',
        marginBottom: 8,
      }}>
        <div style={{fontSize: 13}}>This text should wrap because the container is narrow</div>
      </div>

      {/* Nested self-sizing: inner text sizes inner, which sizes outer */}
      <div style={{
        backgroundColor: '#f0f0f0',
        padding: 8,
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          padding: 8,
          borderWidth: 1,
          borderColor: '#cccccc',
        }}>
          <div style={{fontSize: 14, fontWeight: 'bold'}}>Nested title</div>
          <div style={{fontSize: 12, color: '#888888'}}>Both containers sized by this text</div>
        </div>
      </div>
    </div>
  );
};
