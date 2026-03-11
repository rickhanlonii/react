'use strict';

var React = require('react');

module.exports = function TextInFlex() {
  return (
    <div style={{width: 390}}>
      {/* Text in flex row — items sized by text content */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        padding: 8,
        backgroundColor: '#f0f0f0',
      }}>
        <p style={{fontSize: 14, backgroundColor: '#ffcccc', padding: 4}}>Short</p>
        <p style={{fontSize: 14, backgroundColor: '#ccffcc', padding: 4}}>Medium text</p>
        <p style={{fontSize: 14, backgroundColor: '#ccccff', padding: 4}}>Longer text here</p>
      </div>

      {/* Text in flex row with flexGrow — equal width regardless of text */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#e8e8e8',
      }}>
        <p style={{flexGrow: 1, fontSize: 14, backgroundColor: '#ffdddd', padding: 4}}>A</p>
        <p style={{flexGrow: 1, fontSize: 14, backgroundColor: '#ddffdd', padding: 4}}>Longer B</p>
        <p style={{flexGrow: 1, fontSize: 14, backgroundColor: '#ddddff', padding: 4}}>C</p>
      </div>

      {/* Text with different alignments in flex column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#fff8ee',
      }}>
        <p style={{fontSize: 14, textAlign: 'left'}}>Left aligned</p>
        <p style={{fontSize: 14, textAlign: 'center'}}>Center aligned</p>
        <p style={{fontSize: 14, textAlign: 'right'}}>Right aligned</p>
      </div>

      {/* Mixed text sizes in flex row with alignItems */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#eef0ee',
      }}>
        <p style={{fontSize: 24, fontWeight: 'bold'}}>Title</p>
        <p style={{fontSize: 12, color: '#888888'}}>subtitle text</p>
      </div>

      {/* Text wrapping in constrained flex child */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{width: 60, height: 60, backgroundColor: '#ddcccc'}} />
        <div style={{flexGrow: 1, flexShrink: 1}}>
          <p style={{fontSize: 14, fontWeight: 'bold'}}>Heading</p>
          <p style={{fontSize: 12, color: '#666666', marginTop: 4}}>
            This text should wrap within the remaining space after the fixed-width element.
          </p>
        </div>
      </div>

      {/* Heading + paragraph stacked in flex column */}
      <div style={{
        marginTop: 12,
        padding: 12,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#dddddd',
        borderRadius: 6,
      }}>
        <h2 style={{fontSize: 20, fontWeight: 'bold'}}>Section Title</h2>
        <p style={{fontSize: 14, color: '#555555', marginTop: 6}}>
          Body text below the heading inside a bordered container.
        </p>
      </div>
    </div>
  );
};
