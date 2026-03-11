'use strict';

var React = require('react');

module.exports = function InlineTextExtras() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* mark — highlighted text (yellow background) */}
      <p>This has a <mark>highlighted</mark> word in it.</p>

      {/* small — smaller font size */}
      <p>Normal text and <small>small text</small> together.</p>

      {/* sub — subscript text */}
      <p>H<sub>2</sub>O is water.</p>

      {/* sup — superscript text */}
      <p>E = mc<sup>2</sup> is famous.</p>

      {/* Combined inline elements */}
      <p>
        <mark>Highlighted</mark> and <small>small</small> and{' '}
        <sub>sub</sub> and <sup>sup</sup> in one paragraph.
      </p>

      {/* mark with custom color override */}
      <p>
        <mark style={{backgroundColor: '#90EE90', color: '#006400'}}>
          Custom green highlight
        </mark>
      </p>

      {/* small nested inside mark */}
      <p>
        <mark><small>Small highlighted text</small></mark>
      </p>

      {/* Multiple marks in one paragraph */}
      <p>
        The <mark>quick</mark> brown fox <mark>jumps</mark> over the{' '}
        <mark>lazy</mark> dog.
      </p>
    </div>
  );
};
