'use strict';

var React = require('react');

module.exports = function AspectRatioInFlex() {
  return (
    <div style={{padding: 8}}>
      {/* aspectRatio on fixed-width element */}
      <div style={{
        width: 200,
        aspectRatio: 2,
        backgroundColor: '#4a90d9',
        marginBottom: 8,
      }} />

      {/* aspectRatio square (1:1) */}
      <div style={{
        width: 100,
        aspectRatio: 1,
        backgroundColor: '#5ba55b',
        marginBottom: 8,
      }} />

      {/* aspectRatio on flex children in row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <div style={{width: 80, aspectRatio: 1, backgroundColor: '#4a90d9'}} />
        <div style={{width: 80, aspectRatio: 0.5, backgroundColor: '#27ae60'}} />
        <div style={{width: 80, aspectRatio: 2, backgroundColor: '#e67e22'}} />
      </div>

      {/* aspectRatio with flexGrow */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <div style={{flexGrow: 1, aspectRatio: 1, backgroundColor: '#4a90d9'}} />
        <div style={{flexGrow: 1, aspectRatio: 1, backgroundColor: '#5ba55b'}} />
        <div style={{flexGrow: 1, aspectRatio: 1, backgroundColor: '#e67e22'}} />
      </div>

      {/* aspectRatio in flex column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <div style={{width: 100, aspectRatio: 2, backgroundColor: '#5ba55b'}} />
        <div style={{width: 150, aspectRatio: 1, backgroundColor: '#27ae60'}} />
        <div style={{width: 200, aspectRatio: 0.5, backgroundColor: '#1abc9c'}} />
      </div>

      {/* aspectRatio with maxWidth/maxHeight constraints */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <div style={{width: 200, aspectRatio: 1, maxHeight: 80, backgroundColor: '#e67e22'}} />
        <div style={{flexGrow: 1, aspectRatio: 2, maxHeight: 60, backgroundColor: '#d94a4a'}} />
      </div>

      {/* aspectRatio with content inside */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <div style={{
          width: 120,
          aspectRatio: 1,
          backgroundColor: '#e8d5f5',
          padding: 8,
        }}>
          <div style={{width: 40, height: 40, backgroundColor: '#9b59b6'}} />
        </div>
        <div style={{
          width: 120,
          aspectRatio: 1.5,
          backgroundColor: '#fce4ec',
          padding: 8,
        }}>
          <div style={{height: 20, backgroundColor: '#d94a4a', marginBottom: 4}} />
          <div style={{height: 20, backgroundColor: '#e57373'}} />
        </div>
      </div>
    </div>
  );
};
