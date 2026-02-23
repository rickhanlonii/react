'use strict';

var React = require('react');

module.exports = function NestedInlineText() {
  return (
    <div style={{padding: 8}}>
      {/* Span with different color inside p */}
      <p style={{fontSize: 16, margin: 0, marginBottom: 8}}>
        Normal text <span style={{color: '#d94a4a'}}>red span</span> back to normal.
      </p>

      {/* Multiple styled spans in one p */}
      <p style={{fontSize: 16, margin: 0, marginBottom: 8}}>
        Start <span style={{fontWeight: 'bold'}}>bold</span> then <span style={{color: '#4a90d9'}}>blue</span> then <span style={{fontWeight: 'bold', color: '#5ba55b'}}>bold green</span> end.
      </p>

      {/* Nested spans */}
      <p style={{fontSize: 16, margin: 0, marginBottom: 8}}>
        Outer <span style={{color: '#9b59b6'}}>purple <span style={{fontWeight: 'bold'}}>bold purple</span> still purple</span> outer.
      </p>

      {/* Span with background color */}
      <p style={{fontSize: 16, margin: 0, marginBottom: 8}}>
        Text with <span style={{backgroundColor: '#fff3cd', color: '#856404'}}>highlighted span</span> inline.
      </p>

      {/* Different font sizes in spans */}
      <p style={{fontSize: 16, margin: 0, marginBottom: 8}}>
        Normal <span style={{fontSize: 12}}>smaller</span> normal <span style={{fontSize: 24}}>larger</span> normal.
      </p>

      {/* Span inside styled p */}
      <p style={{fontSize: 18, color: '#333333', fontWeight: 'bold', margin: 0, marginBottom: 8}}>
        Bold parent <span style={{fontWeight: 'normal', color: '#999999'}}>normal gray child</span> bold again.
      </p>

      {/* Multiple inline elements mixed */}
      <p style={{fontSize: 14, margin: 0, marginBottom: 8}}>
        Regular <b>bold</b> and <span style={{color: '#d94a4a'}}>red <b>bold red</b></span> and <i>italic</i> text.
      </p>

      {/* Long text with spans that causes wrapping */}
      <div style={{maxWidth: 300, backgroundColor: '#f0f0f0', padding: 8}}>
        <p style={{fontSize: 14, margin: 0}}>
          This is a longer paragraph with <span style={{color: '#4a90d9', fontWeight: 'bold'}}>an important styled span</span> that should cause the text to wrap across multiple lines within the container.
        </p>
      </div>
    </div>
  );
};
