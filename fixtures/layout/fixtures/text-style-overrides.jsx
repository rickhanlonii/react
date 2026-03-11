'use strict';

var React = require('react');

module.exports = function TextStyleOverrides() {
  return (
    <div style={{width: 390}}>
      {/* fontSize override on p */}
      <p style={{fontSize: 24}}>Large text (24px)</p>
      <p style={{fontSize: 12}}>Small text (12px)</p>

      {/* Color overrides */}
      <p style={{color: '#cc0000', marginTop: 10}}>Red text</p>
      <p style={{color: '#0066cc'}}>Blue text</p>

      {/* fontWeight overrides */}
      <p style={{fontWeight: 'bold', marginTop: 10}}>Bold paragraph</p>
      <p style={{fontWeight: '300'}}>Light weight paragraph</p>

      {/* textAlign */}
      <p style={{textAlign: 'center', marginTop: 10, backgroundColor: '#eeeeee'}}>Centered text</p>
      <p style={{textAlign: 'right', backgroundColor: '#dddddd'}}>Right-aligned text</p>

      {/* Combined overrides */}
      <p style={{
        fontSize: 20,
        fontWeight: 'bold',
        color: '#006600',
        textAlign: 'center',
        marginTop: 10,
        backgroundColor: '#eeffee',
      }}>
        Combined: large, bold, green, centered
      </p>

      {/* Heading with color override */}
      <h2 style={{color: '#660066'}}>Purple heading</h2>
    </div>
  );
};
