'use strict';

var React = require('react');

module.exports = function BorderUniformVsSides() {
  return (
    <div style={{padding: 8}}>
      {/* Uniform borderWidth vs per-side — same total */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 170,
          height: 60,
          borderWidth: 3,
          borderColor: '#4a90d9',
          backgroundColor: '#dae8fc',
        }} />
        <div style={{
          width: 170,
          height: 60,
          borderTopWidth: 3,
          borderRightWidth: 3,
          borderBottomWidth: 3,
          borderLeftWidth: 3,
          borderColor: '#4a90d9',
          backgroundColor: '#dae8fc',
        }} />
      </div>

      {/* Thick top, thin sides */}
      <div style={{
        width: 374,
        height: 50,
        borderTopWidth: 6,
        borderTopColor: '#d94a4a',
        borderRightWidth: 1,
        borderRightColor: '#999999',
        borderBottomWidth: 1,
        borderBottomColor: '#999999',
        borderLeftWidth: 1,
        borderLeftColor: '#999999',
        backgroundColor: '#f8cecc',
        marginBottom: 8,
        padding: 8,
      }}>
        <div style={{fontSize: 12}}>Thick top border</div>
      </div>

      {/* Left accent border */}
      <div style={{
        width: 374,
        borderLeftWidth: 4,
        borderLeftColor: '#5ba55b',
        backgroundColor: '#d5e8d4',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{fontSize: 13, fontWeight: 'bold'}}>Left accent</div>
        <div style={{fontSize: 12, color: '#666666'}}>Content with left border highlight</div>
      </div>

      {/* Bottom-only border (divider style) */}
      <div style={{marginBottom: 8}}>
        <div style={{
          width: 374,
          borderBottomWidth: 1,
          borderBottomColor: '#cccccc',
          paddingBottom: 8,
          marginBottom: 8,
        }}>
          <div style={{fontSize: 13}}>Section one</div>
        </div>
        <div style={{
          width: 374,
          borderBottomWidth: 1,
          borderBottomColor: '#cccccc',
          paddingBottom: 8,
          marginBottom: 8,
        }}>
          <div style={{fontSize: 13}}>Section two</div>
        </div>
        <div style={{
          width: 374,
          paddingBottom: 8,
        }}>
          <div style={{fontSize: 13}}>Section three (no border)</div>
        </div>
      </div>

      {/* Per-side different widths */}
      <div style={{
        width: 374,
        height: 60,
        borderTopWidth: 1,
        borderRightWidth: 4,
        borderBottomWidth: 8,
        borderLeftWidth: 2,
        borderColor: '#9b59b6',
        backgroundColor: '#f5f0ff',
        marginBottom: 8,
      }} />

      {/* Uniform border with borderRadius vs per-side border with borderRadius */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 170,
          height: 60,
          borderWidth: 2,
          borderColor: '#e67e22',
          borderRadius: 8,
          backgroundColor: '#fff3cd',
        }} />
        <div style={{
          width: 170,
          height: 60,
          borderTopWidth: 4,
          borderTopColor: '#e67e22',
          borderRightWidth: 1,
          borderRightColor: '#e67e22',
          borderBottomWidth: 1,
          borderBottomColor: '#e67e22',
          borderLeftWidth: 4,
          borderLeftColor: '#e67e22',
          borderRadius: 8,
          backgroundColor: '#fff3cd',
        }} />
      </div>

      {/* Flex row items with different per-side borders */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
      }}>
        <div style={{
          flex: 1,
          height: 50,
          borderLeftWidth: 4,
          borderLeftColor: '#d94a4a',
          backgroundColor: '#f8cecc',
          padding: 8,
        }}>
          <div style={{fontSize: 11}}>Left</div>
        </div>
        <div style={{
          flex: 1,
          height: 50,
          borderBottomWidth: 4,
          borderBottomColor: '#4a90d9',
          backgroundColor: '#dae8fc',
          padding: 8,
        }}>
          <div style={{fontSize: 11}}>Bottom</div>
        </div>
        <div style={{
          flex: 1,
          height: 50,
          borderTopWidth: 4,
          borderTopColor: '#5ba55b',
          backgroundColor: '#d5e8d4',
          padding: 8,
        }}>
          <div style={{fontSize: 11}}>Top</div>
        </div>
      </div>
    </div>
  );
};
