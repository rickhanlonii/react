'use strict';

var React = require('react');

module.exports = function CardLayout() {
  return (
    <div style={{width: 390, padding: 16}}>
      {/* Simple card */}
      <div style={{
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#dddddd',
        borderRadius: 8,
        padding: 16,
      }}>
        <div style={{
          height: 120,
          backgroundColor: '#eeeeee',
          borderRadius: 4,
        }} />
        <p style={{fontSize: 18, fontWeight: 'bold', marginTop: 12}}>Card Title</p>
        <p style={{fontSize: 14, color: '#666666', marginTop: 4}}>
          A short description that explains the card content.
        </p>
      </div>

      {/* Card with action buttons */}
      <div style={{
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#dddddd',
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
      }}>
        <p style={{fontSize: 16, fontWeight: 'bold'}}>Action Card</p>
        <p style={{fontSize: 14, color: '#888888', marginTop: 4}}>
          Card with buttons at the bottom.
        </p>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          marginTop: 12,
        }}>
          <div style={{
            flexGrow: 1,
            height: 36,
            backgroundColor: '#4488ff',
            borderRadius: 4,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <p style={{color: '#ffffff', fontSize: 14, textAlign: 'center'}}>Primary</p>
          </div>
          <div style={{
            flexGrow: 1,
            height: 36,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: '#cccccc',
            borderRadius: 4,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <p style={{fontSize: 14, textAlign: 'center'}}>Secondary</p>
          </div>
        </div>
      </div>

      {/* Horizontal card (image left, content right) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#dddddd',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 16,
      }}>
        <div style={{
          width: 100,
          backgroundColor: '#ddddee',
        }} />
        <div style={{flexGrow: 1, padding: 12}}>
          <p style={{fontSize: 16, fontWeight: 'bold'}}>Horizontal Card</p>
          <p style={{fontSize: 13, color: '#777777', marginTop: 4}}>
            Image on the left, content on the right.
          </p>
        </div>
      </div>

      {/* Card grid (two side-by-side) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
      }}>
        <div style={{
          flexGrow: 1,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#dddddd',
          borderRadius: 8,
          padding: 12,
        }}>
          <div style={{height: 60, backgroundColor: '#ffeeee', borderRadius: 4}} />
          <p style={{fontSize: 14, fontWeight: 'bold', marginTop: 8}}>Card A</p>
        </div>
        <div style={{
          flexGrow: 1,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#dddddd',
          borderRadius: 8,
          padding: 12,
        }}>
          <div style={{height: 60, backgroundColor: '#eeeeff', borderRadius: 4}} />
          <p style={{fontSize: 14, fontWeight: 'bold', marginTop: 8}}>Card B</p>
        </div>
      </div>
    </div>
  );
};
