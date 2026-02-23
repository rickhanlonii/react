'use strict';

var React = require('react');

module.exports = function OpacityNested() {
  return (
    <div style={{padding: 8}}>
      {/* Parent opacity affects all children */}
      <div style={{
        opacity: 0.5,
        width: 374,
        backgroundColor: '#4a90d9',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#ffffff', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#ff0000'}} />
      </div>

      {/* Full opacity reference for comparison */}
      <div style={{
        opacity: 1,
        width: 374,
        backgroundColor: '#4a90d9',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#ffffff', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#ff0000'}} />
      </div>

      {/* Nested opacity multiplies: 0.5 * 0.5 = 0.25 effective */}
      <div style={{
        opacity: 0.5,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{
          opacity: 0.5,
          height: 40,
          backgroundColor: '#d94a4a',
        }} />
      </div>

      {/* Different opacity levels side by side */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 60, backgroundColor: '#5ba55b', opacity: 1.0}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#5ba55b', opacity: 0.75}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#5ba55b', opacity: 0.5}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#5ba55b', opacity: 0.25}} />
      </div>

      {/* Opacity on container with border */}
      <div style={{
        opacity: 0.6,
        width: 374,
        padding: 12,
        backgroundColor: '#fff3cd',
        borderWidth: 3,
        borderColor: '#e67e22',
        borderRadius: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e67e22', borderRadius: 4}} />
      </div>

      {/* Child with higher opacity than parent (doesn't exceed parent) */}
      <div style={{
        opacity: 0.3,
        width: 374,
        padding: 12,
        backgroundColor: '#f5f0ff',
        marginBottom: 8,
      }}>
        <div style={{
          opacity: 1.0,
          height: 40,
          backgroundColor: '#9b59b6',
          padding: 8,
        }}>
          <div style={{fontSize: 12, color: '#ffffff'}}>opacity 1 inside opacity 0.3</div>
        </div>
      </div>

      {/* Opacity 0 hides visually but takes space */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#d94a4a', opacity: 0}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#5ba55b'}} />
      </div>
    </div>
  );
};
