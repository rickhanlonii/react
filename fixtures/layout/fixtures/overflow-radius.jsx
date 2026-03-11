'use strict';

var React = require('react');

module.exports = function OverflowRadius() {
  return (
    <div style={{padding: 8}}>
      {/* Rounded card clipping child content */}
      <div style={{
        width: 374,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#4a90d9',
        marginBottom: 8,
      }}>
        <div style={{height: 80, backgroundColor: '#2c3e50'}} />
        <div style={{padding: 12}}>
          <p style={{margin: 0, fontSize: 14, color: '#ffffff'}}>Card with rounded clipping</p>
        </div>
      </div>

      {/* Circle clipping (avatar pattern) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 16,
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          overflow: 'hidden',
          backgroundColor: '#5ba55b',
        }}>
          <div style={{width: 60, height: 60, backgroundColor: '#d94a4a'}} />
        </div>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          overflow: 'hidden',
          backgroundColor: '#9b59b6',
        }}>
          <div style={{width: 80, height: 80, backgroundColor: '#e67e22', marginTop: -10, marginLeft: -10}} />
        </div>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          overflow: 'hidden',
          backgroundColor: '#1abc9c',
        }}>
          <div style={{height: 30, backgroundColor: '#2c3e50'}} />
          <div style={{height: 30, backgroundColor: '#34495e'}} />
        </div>
      </div>

      {/* Pill shape clipping */}
      <div style={{
        width: 200,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          height: 40,
        }}>
          <div style={{flexGrow: 1, backgroundColor: '#4a90d9'}} />
          <div style={{flexGrow: 1, backgroundColor: '#5ba55b'}} />
          <div style={{flexGrow: 1, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* borderRadius without overflow (no clipping) */}
      <div style={{
        width: 374,
        borderRadius: 12,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#d94a4a'}} />
        <div style={{padding: 8}}>
          <p style={{margin: 0, fontSize: 12}}>No overflow hidden — corners not clipped</p>
        </div>
      </div>

      {/* Per-corner radius with overflow hidden */}
      <div style={{
        width: 374,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 20,
        borderBottomLeftRadius: 0,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{height: 50, backgroundColor: '#9b59b6'}} />
        <div style={{padding: 8}}>
          <p style={{margin: 0, fontSize: 12}}>Diagonal radius clipping</p>
        </div>
      </div>

      {/* Rounded with border and overflow */}
      <div style={{
        width: 374,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#4a90d9',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{padding: 8}}>
          <p style={{margin: 0, fontSize: 12}}>Border + radius + overflow</p>
        </div>
      </div>
    </div>
  );
};
