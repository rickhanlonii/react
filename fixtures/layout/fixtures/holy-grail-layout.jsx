'use strict';

var React = require('react');

module.exports = function HolyGrailLayout() {
  return (
    <div style={{width: 390, height: 600}}>
      {/* Header */}
      <div style={{
        height: 50,
        backgroundColor: '#334455',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <p style={{color: '#ffffff', fontSize: 18, fontWeight: 'bold'}}>Header</p>
      </div>

      {/* Middle: sidebar + content + sidebar */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexGrow: 1,
      }}>
        {/* Left sidebar */}
        <div style={{
          width: 80,
          backgroundColor: '#ddeeff',
          padding: 8,
        }}>
          <p style={{fontSize: 12, fontWeight: 'bold'}}>Nav</p>
          <div style={{height: 20, marginTop: 8, backgroundColor: '#aaccee'}} />
          <div style={{height: 20, marginTop: 6, backgroundColor: '#aaccee'}} />
          <div style={{height: 20, marginTop: 6, backgroundColor: '#aaccee'}} />
        </div>

        {/* Main content */}
        <div style={{
          flexGrow: 1,
          backgroundColor: '#ffffff',
          padding: 12,
        }}>
          <p style={{fontSize: 16, fontWeight: 'bold'}}>Main Content</p>
          <p style={{fontSize: 13, color: '#666666', marginTop: 8}}>
            This is the main content area that grows to fill available space.
          </p>
          <div style={{
            height: 60,
            marginTop: 12,
            backgroundColor: '#f0f0f0',
            borderRadius: 4,
          }} />
          <div style={{
            height: 60,
            marginTop: 8,
            backgroundColor: '#f0f0f0',
            borderRadius: 4,
          }} />
        </div>

        {/* Right sidebar */}
        <div style={{
          width: 70,
          backgroundColor: '#ffeedd',
          padding: 8,
        }}>
          <p style={{fontSize: 12, fontWeight: 'bold'}}>Aside</p>
          <div style={{height: 30, marginTop: 8, backgroundColor: '#eeccaa'}} />
          <div style={{height: 30, marginTop: 6, backgroundColor: '#eeccaa'}} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        height: 40,
        backgroundColor: '#334455',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <p style={{color: '#ffffff', fontSize: 12}}>Footer</p>
      </div>
    </div>
  );
};
