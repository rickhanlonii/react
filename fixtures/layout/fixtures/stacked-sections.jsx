'use strict';

var React = require('react');

module.exports = function StackedSections() {
  return (
    <div style={{width: 390}}>
      {/* Hero section */}
      <section style={{
        height: 120,
        backgroundColor: '#2244aa',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
      }}>
        <h1 style={{fontSize: 22, fontWeight: 'bold', color: '#ffffff'}}>Welcome</h1>
        <p style={{fontSize: 14, color: '#ccddff', marginTop: 4}}>A subtitle goes here</p>
      </section>

      {/* Feature row */}
      <section style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        backgroundColor: '#f8f8f8',
      }}>
        <div style={{
          flex: 1,
          padding: 12,
          backgroundColor: '#ffffff',
          borderRadius: 6,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#eeeeee',
          alignItems: 'center',
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#ddeeff',
          }} />
          <p style={{fontSize: 13, fontWeight: 'bold', marginTop: 8}}>Feature A</p>
        </div>
        <div style={{
          flex: 1,
          padding: 12,
          backgroundColor: '#ffffff',
          borderRadius: 6,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#eeeeee',
          alignItems: 'center',
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#ffeedd',
          }} />
          <p style={{fontSize: 13, fontWeight: 'bold', marginTop: 8}}>Feature B</p>
        </div>
        <div style={{
          flex: 1,
          padding: 12,
          backgroundColor: '#ffffff',
          borderRadius: 6,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#eeeeee',
          alignItems: 'center',
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#eeffdd',
          }} />
          <p style={{fontSize: 13, fontWeight: 'bold', marginTop: 8}}>Feature C</p>
        </div>
      </section>

      {/* Content section */}
      <section style={{padding: 16}}>
        <h2 style={{fontSize: 18, fontWeight: 'bold'}}>About</h2>
        <p style={{fontSize: 14, color: '#555555', marginTop: 8}}>
          A paragraph of body text in a content section below the features.
        </p>
        <div style={{
          height: 80,
          marginTop: 12,
          backgroundColor: '#f0f0f0',
          borderRadius: 4,
        }} />
      </section>

      {/* CTA section */}
      <section style={{
        padding: 16,
        backgroundColor: '#eef4ff',
        alignItems: 'center',
      }}>
        <p style={{fontSize: 16, fontWeight: 'bold'}}>Ready to start?</p>
        <div style={{
          marginTop: 10,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 24,
          paddingRight: 24,
          backgroundColor: '#2244aa',
          borderRadius: 6,
        }}>
          <p style={{color: '#ffffff', fontSize: 14, fontWeight: 'bold'}}>Get Started</p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: 12,
        backgroundColor: '#333333',
        alignItems: 'center',
      }}>
        <p style={{fontSize: 11, color: '#999999'}}>Footer content</p>
      </footer>
    </div>
  );
};
