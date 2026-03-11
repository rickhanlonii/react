'use strict';

var React = require('react');

module.exports = function NestedBorders() {
  return (
    <div style={{width: 390}}>
      {/* Single border nesting */}
      <div style={{
        borderWidth: 2,
        borderColor: '#cc0000',
        padding: 10,
      }}>
        <div style={{
          borderWidth: 2,
          borderColor: '#00cc00',
          padding: 10,
        }}>
          <div style={{
            borderWidth: 2,
            borderColor: '#0000cc',
            padding: 10,
          }}>
            <div style={{height: 30, backgroundColor: '#eeeeee'}} />
          </div>
        </div>
      </div>

      {/* Different border widths per level */}
      <div style={{
        borderWidth: 1,
        borderColor: '#999999',
        padding: 8,
        marginTop: 12,
      }}>
        <div style={{
          borderWidth: 3,
          borderColor: '#666666',
          padding: 8,
        }}>
          <div style={{
            borderWidth: 5,
            borderColor: '#333333',
            padding: 8,
          }}>
            <div style={{height: 20, backgroundColor: '#dddddd'}} />
          </div>
        </div>
      </div>

      {/* Border + borderRadius nesting */}
      <div style={{
        borderWidth: 2,
        borderColor: '#aa4444',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
      }}>
        <div style={{
          borderWidth: 2,
          borderColor: '#4444aa',
          borderRadius: 8,
          padding: 12,
        }}>
          <div style={{height: 30, backgroundColor: '#f0f0f0', borderRadius: 4}} />
        </div>
      </div>

      {/* Borders in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
      }}>
        <div style={{
          flex: 1,
          borderWidth: 2,
          borderColor: '#cc6600',
          padding: 8,
        }}>
          <div style={{
            borderWidth: 1,
            borderColor: '#ffaa44',
            padding: 6,
          }}>
            <div style={{height: 20, backgroundColor: '#fff0dd'}} />
          </div>
        </div>
        <div style={{
          flex: 1,
          borderWidth: 2,
          borderColor: '#0066cc',
          padding: 8,
        }}>
          <div style={{
            borderWidth: 1,
            borderColor: '#44aaff',
            padding: 6,
          }}>
            <div style={{height: 20, backgroundColor: '#ddf0ff'}} />
          </div>
        </div>
      </div>

      {/* Per-side borders nested */}
      <div style={{
        borderTopWidth: 4,
        borderBottomWidth: 4,
        borderColor: '#885588',
        padding: 10,
        marginTop: 12,
      }}>
        <div style={{
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderColor: '#558855',
          padding: 10,
        }}>
          <div style={{height: 30, backgroundColor: '#f5f5f5'}} />
        </div>
      </div>
    </div>
  );
};
