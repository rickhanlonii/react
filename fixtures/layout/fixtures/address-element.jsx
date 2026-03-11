'use strict';

var React = require('react');

module.exports = function AddressElement() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic address (italic by default) */}
      <address>
        <p>123 Main Street</p>
        <p>Springfield, IL 62701</p>
      </address>

      {/* Address with link */}
      <address style={{marginTop: 16}}>
        <p>Written by <a>John Doe</a></p>
        <p>Contact: <a>john@example.com</a></p>
      </address>

      {/* Styled address in a footer context */}
      <footer style={{
        marginTop: 16,
        padding: 10,
        backgroundColor: '#f5f5f5',
        borderTopWidth: 1,
        borderTopColor: '#cccccc',
      }}>
        <address style={{fontSize: 14, color: '#666666'}}>
          <p>Company Inc.</p>
          <p>456 Corporate Ave, Suite 100</p>
          <p>Business City, CA 90210</p>
        </address>
      </footer>
    </div>
  );
};
