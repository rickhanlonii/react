'use strict';

var React = require('react');

module.exports = function FlexStretchHeight() {
  return (
    <div style={{padding: 8}}>
      {/* Default stretch: children match tallest */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, backgroundColor: '#4a90d9', height: 80}} />
        <div style={{flex: 1, backgroundColor: '#5ba55b'}} />
        <div style={{flex: 1, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Stretch with content inside (content smaller than stretch) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, backgroundColor: '#e8e8e8', padding: 8}}>
          <div style={{height: 20, backgroundColor: '#4a90d9'}} />
        </div>
        <div style={{flex: 1, backgroundColor: '#e8e8e8', padding: 8}}>
          <div style={{height: 60, backgroundColor: '#5ba55b'}} />
        </div>
        <div style={{flex: 1, backgroundColor: '#e8e8e8', padding: 8}}>
          <div style={{height: 30, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* No stretch with alignItems: flex-start */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, backgroundColor: '#e8e8e8', padding: 8}}>
          <div style={{height: 20, backgroundColor: '#5ba55b'}} />
        </div>
        <div style={{flex: 1, backgroundColor: '#e8e8e8', padding: 8}}>
          <div style={{height: 60, backgroundColor: '#27ae60'}} />
        </div>
        <div style={{flex: 1, backgroundColor: '#e8e8e8', padding: 8}}>
          <div style={{height: 30, backgroundColor: '#1abc9c'}} />
        </div>
      </div>

      {/* Stretch in column (cross-axis is width) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e67e22'}} />
        <div style={{height: 30, width: 200, backgroundColor: '#d94a4a'}} />
        <div style={{height: 30, backgroundColor: '#f1c40f'}} />
      </div>

      {/* alignSelf stretch on one child */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{flex: 1, height: 80, backgroundColor: '#8e44ad'}} />
        <div style={{flex: 1, backgroundColor: '#7d3c98', alignSelf: 'stretch'}} />
      </div>

      {/* Stretch with nested flex */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        height: 120,
        backgroundColor: '#f8cecc',
        padding: 8,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#fce4ec',
          padding: 4,
        }}>
          <div style={{height: 20, backgroundColor: '#d94a4a'}} />
          <div style={{height: 20, backgroundColor: '#e57373'}} />
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          backgroundColor: '#e8f5e9',
          padding: 4,
        }}>
          <div style={{height: 40, backgroundColor: '#5ba55b'}} />
        </div>
      </div>
    </div>
  );
};
