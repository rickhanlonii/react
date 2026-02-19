'use strict';

var React = require('react');

module.exports = function TextDecorationTransform() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* textDecorationLine: underline */}
      <p style={{textDecorationLine: 'underline'}}>Underlined text</p>

      {/* textDecorationLine: line-through */}
      <p style={{textDecorationLine: 'line-through'}}>Strikethrough text</p>

      {/* textTransform: uppercase */}
      <p style={{textTransform: 'uppercase'}}>uppercase text</p>

      {/* textTransform: lowercase */}
      <p style={{textTransform: 'lowercase'}}>LOWERCASE TEXT</p>

      {/* textTransform: capitalize */}
      <p style={{textTransform: 'capitalize'}}>capitalize each word</p>

      {/* lineHeight: larger than font */}
      <p style={{lineHeight: 2, fontSize: 16}}>
        Line height 32 with font size 16. This text has extra vertical spacing between lines when it wraps.
      </p>

      {/* letterSpacing: positive */}
      <p style={{letterSpacing: 4}}>Spaced out letters</p>

      {/* Combined: underline + uppercase + letterSpacing */}
      <p style={{
        textDecorationLine: 'underline',
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontSize: 14,
      }}>combined styles</p>
    </div>
  );
};
