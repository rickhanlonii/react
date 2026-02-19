'use strict';

var React = require('react');

module.exports = function DetailsSummary() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic details/summary */}
      <details>
        <summary>Click to expand</summary>
        <p>This is the hidden content that appears when details is open.</p>
      </details>

      {/* Styled details/summary */}
      <details style={{
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#cccccc',
        borderRadius: 4,
        padding: 10,
      }}>
        <summary style={{fontWeight: 'bold', color: '#333333'}}>
          Styled Section
        </summary>
        <p>Content with styled container and summary.</p>
      </details>

      {/* Multiple details blocks */}
      <details style={{marginTop: 16, backgroundColor: '#f0f8ff', padding: 8}}>
        <summary>Section One</summary>
        <p>First section content.</p>
      </details>
      <details style={{marginTop: 8, backgroundColor: '#fff0f0', padding: 8}}>
        <summary>Section Two</summary>
        <p>Second section content.</p>
      </details>

      {/* Nested details */}
      <details style={{marginTop: 16}}>
        <summary>Outer Details</summary>
        <div style={{paddingLeft: 16}}>
          <p>Outer content.</p>
          <details>
            <summary>Inner Details</summary>
            <p>Nested inner content.</p>
          </details>
        </div>
      </details>
    </div>
  );
};
