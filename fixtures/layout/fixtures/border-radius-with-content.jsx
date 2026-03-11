'use strict';

var React = require('react');

module.exports = function BorderRadiusWithContent() {
  return (
    <div style={{padding: 8}}>
      {/* Border radius with padded content children */}
      <div style={{
        width: 374,
        borderRadius: 12,
        backgroundColor: '#f0f0f0',
        padding: 16,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 8}} />
        <div style={{height: 30, backgroundColor: '#5ba55b'}} />
      </div>

      {/* Border radius with border and content */}
      <div style={{
        width: 374,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#333333',
        backgroundColor: '#dae8fc',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9', borderRadius: 8}} />
      </div>

      {/* Large radius on small container with child filling it */}
      <div style={{
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#d5e8d4',
        overflow: 'hidden',
        marginBottom: 8,
      }}>
        <div style={{width: 60, height: 120, backgroundColor: '#5ba55b'}} />
      </div>

      {/* Per-corner radius with flex content */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{flex: 1, height: 50, backgroundColor: '#e67e22'}} />
        <div style={{flex: 1, height: 50, backgroundColor: '#d94a4a'}} />
        <div style={{flex: 1, height: 50, backgroundColor: '#f1c40f'}} />
      </div>

      {/* Nested border radius — inner and outer both rounded */}
      <div style={{
        width: 374,
        borderRadius: 16,
        backgroundColor: '#f5f0ff',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{
          borderRadius: 8,
          backgroundColor: '#e8d5f5',
          padding: 12,
        }}>
          <div style={{height: 30, backgroundColor: '#9b59b6', borderRadius: 4}} />
        </div>
      </div>

      {/* Pill shape with flex row content */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f8cecc',
        padding: 4,
        marginBottom: 8,
        gap: 4,
        alignItems: 'center',
      }}>
        <div style={{width: 40, height: 40, borderRadius: 20, backgroundColor: '#d94a4a'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#e57373', borderRadius: 20}} />
      </div>

      {/* Card with rounded top and square bottom */}
      <div style={{
        width: 200,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
        backgroundColor: '#e8f5e9',
      }}>
        <div style={{height: 80, backgroundColor: '#81c784'}} />
        <div style={{padding: 8}}>
          <div style={{height: 20, backgroundColor: '#c8e6c9', marginBottom: 4}} />
          <div style={{height: 14, width: 120, backgroundColor: '#a5d6a7'}} />
        </div>
      </div>
    </div>
  );
};
