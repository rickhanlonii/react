'use strict';

var React = require('react');

module.exports = function PreElement() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic pre — monospace font with margins */}
      <pre>function hello() {'{\n  console.log("Hello!");\n}'}</pre>

      {/* Pre with custom background */}
      <pre style={{
        backgroundColor: '#f4f4f4',
        padding: 12,
        borderRadius: 4,
      }}>
        {'const x = 42;\nconst y = x * 2;\nreturn y;'}
      </pre>

      {/* Pre inside article context */}
      <div>
        <p>Some paragraph text before the code block.</p>
        <pre style={{
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 8,
        }}>
          {'<div style={{color: "red"}}>\n  <p>Hello World</p>\n</div>'}
        </pre>
        <p>Some paragraph text after the code block.</p>
      </div>

      {/* Pre with overflow — long lines */}
      <pre style={{
        backgroundColor: '#eef',
        padding: 8,
        overflow: 'hidden',
        maxHeight: 60,
      }}>
        {'Line 1: short\nLine 2: a much longer line that might extend beyond the container width\nLine 3: short\nLine 4: another line\nLine 5: yet another line'}
      </pre>
    </div>
  );
};
