'use strict';

var React = require('react');

module.exports = function LineHeightVariations() {
  return (
    <div style={{padding: 8}}>
      {/* Default line height vs explicit values */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          backgroundColor: '#dae8fc',
          padding: 8,
        }}>
          <div style={{fontSize: 14}}>Default line height</div>
        </div>
        <div style={{
          flex: 1,
          backgroundColor: '#d5e8d4',
          padding: 8,
        }}>
          <div style={{fontSize: 14, lineHeight: 28}}>lineHeight: 28</div>
        </div>
      </div>

      {/* Tight line height (equal to font size) */}
      <div style={{
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
        width: 374,
      }}>
        <div style={{fontSize: 14, lineHeight: 14}}>Tight: lineHeight equals fontSize (14px). This text wraps to show tight spacing between lines when the container is narrow enough.</div>
      </div>

      {/* Loose line height (double font size) */}
      <div style={{
        backgroundColor: '#f8cecc',
        padding: 8,
        marginBottom: 8,
        width: 374,
      }}>
        <div style={{fontSize: 14, lineHeight: 28}}>Loose: lineHeight double fontSize (28px). This text wraps to show spacious line spacing between lines in the container.</div>
      </div>

      {/* Different line heights in same container */}
      <div style={{
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{fontSize: 14, lineHeight: 14}}>Tight spacing</div>
        <div style={{fontSize: 14, lineHeight: 28}}>Loose spacing</div>
        <div style={{fontSize: 14}}>Default spacing</div>
      </div>

      {/* Line height with different font sizes */}
      <div style={{
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{fontSize: 20, lineHeight: 30}}>Large text, lineHeight 30</div>
        <div style={{fontSize: 12, lineHeight: 30}}>Small text, same lineHeight 30</div>
      </div>

      {/* Line height affecting container height in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          backgroundColor: '#e8e8e8',
          padding: 8,
          borderWidth: 1,
          borderColor: '#cccccc',
        }}>
          <div style={{fontSize: 14, lineHeight: 14}}>Line 1</div>
          <div style={{fontSize: 14, lineHeight: 14}}>Line 2</div>
          <div style={{fontSize: 14, lineHeight: 14}}>Line 3</div>
        </div>
        <div style={{
          flex: 1,
          backgroundColor: '#e8e8e8',
          padding: 8,
          borderWidth: 1,
          borderColor: '#cccccc',
        }}>
          <div style={{fontSize: 14, lineHeight: 28}}>Line 1</div>
          <div style={{fontSize: 14, lineHeight: 28}}>Line 2</div>
          <div style={{fontSize: 14, lineHeight: 28}}>Line 3</div>
        </div>
      </div>

      {/* Line height on heading-like text */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: 8,
        borderWidth: 2,
        borderColor: '#4a90d9',
      }}>
        <div style={{fontSize: 24, fontWeight: 'bold', lineHeight: 28}}>Tight Heading</div>
        <div style={{fontSize: 13, color: '#666666', lineHeight: 20}}>Description with comfortable line height for readability in longer text passages.</div>
      </div>
    </div>
  );
};
