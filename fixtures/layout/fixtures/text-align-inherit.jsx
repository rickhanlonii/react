'use strict';

var React = require('react');

module.exports = function TextAlignInherit() {
  return (
    <div style={{padding: 8}}>
      {/* textAlign left (default) */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14}}>Left aligned (default)</p>
      </div>

      {/* textAlign center on container */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
        textAlign: 'center',
      }}>
        <p style={{margin: 0, fontSize: 14}}>Centered via parent</p>
      </div>

      {/* textAlign right on container */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
        textAlign: 'right',
      }}>
        <p style={{margin: 0, fontSize: 14}}>Right aligned via parent</p>
      </div>

      {/* textAlign center with multiple children */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
        textAlign: 'center',
      }}>
        <h3 style={{margin: 0, marginBottom: 4}}>Centered Heading</h3>
        <p style={{margin: 0, fontSize: 14}}>Centered paragraph text</p>
      </div>

      {/* Child overriding parent textAlign */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
        textAlign: 'center',
      }}>
        <p style={{margin: 0, fontSize: 14}}>Inherits center</p>
        <p style={{margin: 0, fontSize: 14, textAlign: 'left'}}>Overrides to left</p>
        <p style={{margin: 0, fontSize: 14, textAlign: 'right'}}>Overrides to right</p>
      </div>

      {/* textAlign center on nested containers */}
      <div style={{
        width: 374,
        backgroundColor: '#eeeeee',
        padding: 8,
        textAlign: 'center',
        marginBottom: 8,
      }}>
        <p style={{margin: 0, marginBottom: 4, fontSize: 14}}>Outer centered</p>
        <div style={{backgroundColor: '#dddddd', padding: 8}}>
          <p style={{margin: 0, fontSize: 14}}>Nested inherits center</p>
        </div>
      </div>

      {/* textAlign right with different text elements */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        textAlign: 'right',
      }}>
        <h4 style={{margin: 0, marginBottom: 4}}>Right Heading</h4>
        <p style={{margin: 0, marginBottom: 4, fontSize: 14}}>Right paragraph</p>
        <p style={{margin: 0, fontSize: 12, color: '#999999'}}>Right small text</p>
      </div>
    </div>
  );
};
