'use strict';

var React = require('react');

module.exports = function BorderWidthZero() {
  return (
    <div style={{padding: 8}}>
      {/* borderWidth 0 vs no border — should be identical layout */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 80,
          height: 40,
          backgroundColor: '#4a90d9',
          borderWidth: 0,
        }} />
        <div style={{
          width: 80,
          height: 40,
          backgroundColor: '#5ba55b',
        }} />
      </div>

      {/* borderWidth 0 on one side, border on others */}
      <div style={{
        width: 374,
        height: 50,
        backgroundColor: '#f0f0f0',
        borderTopWidth: 3,
        borderTopColor: '#d94a4a',
        borderBottomWidth: 0,
        borderLeftWidth: 2,
        borderLeftColor: '#4a90d9',
        borderRightWidth: 2,
        borderRightColor: '#4a90d9',
        marginBottom: 8,
        padding: 8,
      }}>
        <p style={{margin: 0, fontSize: 12}}>Top and side borders, no bottom</p>
      </div>

      {/* Siblings: one with border, one with borderWidth 0 */}
      <div style={{marginBottom: 8}}>
        <div style={{
          width: 374,
          height: 40,
          backgroundColor: '#e8e8e8',
          borderWidth: 2,
          borderColor: '#333333',
          borderStyle: 'solid',
          marginBottom: 4,
        }}>
          <p style={{margin: 0, fontSize: 12, padding: 8}}>With border</p>
        </div>
        <div style={{
          width: 374,
          height: 40,
          backgroundColor: '#e8e8e8',
          borderWidth: 0,
        }}>
          <p style={{margin: 0, fontSize: 12, padding: 8}}>borderWidth: 0</p>
        </div>
      </div>

      {/* borderWidth 0 overriding individual sides */}
      <div style={{
        width: 374,
        height: 50,
        backgroundColor: '#fff3cd',
        borderTopWidth: 3,
        borderTopColor: '#e67e22',
        borderBottomWidth: 3,
        borderBottomColor: '#e67e22',
        borderLeftWidth: 0,
        borderRightWidth: 0,
        marginBottom: 8,
        padding: 8,
      }}>
        <p style={{margin: 0, fontSize: 12}}>Horizontal borders only</p>
      </div>

      {/* Flex children with mixed border presence */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          height: 50,
          backgroundColor: '#d5e8d4',
          borderWidth: 2,
          borderColor: '#5ba55b',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 11}}>border: 2</p>
        </div>
        <div style={{
          flex: 1,
          height: 50,
          backgroundColor: '#dae8fc',
          borderWidth: 0,
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 11}}>border: 0</p>
        </div>
        <div style={{
          flex: 1,
          height: 50,
          backgroundColor: '#f8cecc',
          borderWidth: 1,
          borderColor: '#d94a4a',
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 11}}>border: 1</p>
        </div>
      </div>

      {/* Nested: outer border, inner borderWidth 0 */}
      <div style={{
        width: 374,
        borderWidth: 3,
        borderColor: '#9b59b6',
        padding: 12,
      }}>
        <div style={{
          backgroundColor: '#f5f0ff',
          borderWidth: 0,
          padding: 8,
          height: 40,
        }}>
          <p style={{margin: 0, fontSize: 12}}>Inner: no border</p>
        </div>
      </div>
    </div>
  );
};
