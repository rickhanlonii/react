'use strict';

var React = require('react');

module.exports = function HrStandalone() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Default hr */}
      <p>Content above the default hr.</p>
      <hr />
      <p>Content below the default hr.</p>

      {/* Thick colored hr */}
      <hr style={{
        borderTopWidth: 3,
        borderTopColor: '#3366cc',
        marginTop: 16,
        marginBottom: 16,
      }} />

      {/* Thin subtle hr */}
      <hr style={{
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        marginTop: 8,
        marginBottom: 8,
      }} />

      {/* Hr with constrained width */}
      <hr style={{
        width: 200,
        borderTopWidth: 2,
        borderTopColor: '#cc3333',
        marginTop: 16,
        marginBottom: 16,
      }} />

      {/* Multiple hrs as section dividers */}
      <p>Section A content.</p>
      <hr style={{borderTopColor: '#999999'}} />
      <p>Section B content.</p>
      <hr style={{borderTopColor: '#999999'}} />
      <p>Section C content.</p>
    </div>
  );
};
