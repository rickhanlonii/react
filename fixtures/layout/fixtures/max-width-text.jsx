'use strict';

var React = require('react');

module.exports = function MaxWidthText() {
  return (
    <div style={{padding: 8}}>
      {/* maxWidth constraining text to wrap */}
      <div style={{
        maxWidth: 200,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14}}>This text should wrap because the container has a maxWidth of 200 pixels applied.</p>
      </div>

      {/* maxWidth on the text element itself */}
      <p style={{
        maxWidth: 150,
        backgroundColor: '#e8e8e8',
        padding: 8,
        marginTop: 0,
        marginBottom: 8,
        fontSize: 14,
      }}>Text with maxWidth directly on the paragraph element.</p>

      {/* maxWidth inside a flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          maxWidth: 120,
          backgroundColor: '#4a90d9',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Capped at 120</p>
        </div>
        <div style={{
          flexGrow: 1,
          backgroundColor: '#5ba55b',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Grows to fill remaining space</p>
        </div>
      </div>

      {/* maxWidth smaller than content with overflow hidden */}
      <div style={{
        maxWidth: 100,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14}}>Clipped by overflow hidden plus maxWidth constraint.</p>
      </div>

      {/* minWidth and maxWidth together */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 8,
      }}>
        <div style={{
          minWidth: 80,
          maxWidth: 150,
          flexGrow: 1,
          backgroundColor: '#d94a4a',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Min 80, max 150</p>
        </div>
        <div style={{
          minWidth: 80,
          maxWidth: 150,
          flexGrow: 1,
          backgroundColor: '#9b59b6',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Min 80, max 150</p>
        </div>
        <div style={{
          flexGrow: 1,
          backgroundColor: '#e67e22',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Unconstrained</p>
        </div>
      </div>
    </div>
  );
};
