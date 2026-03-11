'use strict';

var React = require('react');

module.exports = function BorderStyleVariations() {
  return (
    <div style={{padding: 8}}>
      {/* Solid border (default when borderWidth set) */}
      <div style={{
        width: 374,
        height: 50,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#333333',
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }} />

      {/* Thick solid border */}
      <div style={{
        width: 374,
        height: 50,
        borderWidth: 6,
        borderStyle: 'solid',
        borderColor: '#4a90d9',
        backgroundColor: '#dae8fc',
        marginBottom: 8,
      }} />

      {/* Per-side border styles */}
      <div style={{
        width: 374,
        height: 60,
        borderTopWidth: 4,
        borderTopColor: '#d94a4a',
        borderBottomWidth: 2,
        borderBottomColor: '#5ba55b',
        borderLeftWidth: 1,
        borderLeftColor: '#4a90d9',
        borderRightWidth: 3,
        borderRightColor: '#e67e22',
        backgroundColor: '#f5f5f5',
        marginBottom: 8,
      }} />

      {/* Border with padding and content */}
      <div style={{
        width: 374,
        borderWidth: 3,
        borderColor: '#9b59b6',
        backgroundColor: '#f5f0ff',
        padding: 12,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#e8d5f5'}} />
      </div>

      {/* Border + borderRadius */}
      <div style={{
        width: 200,
        height: 80,
        borderWidth: 3,
        borderColor: '#27ae60',
        borderRadius: 12,
        backgroundColor: '#d5e8d4',
        marginBottom: 8,
      }} />

      {/* Borders in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          height: 50,
          borderWidth: 2,
          borderColor: '#4a90d9',
          backgroundColor: '#dae8fc',
        }} />
        <div style={{
          flex: 1,
          height: 50,
          borderWidth: 4,
          borderColor: '#d94a4a',
          backgroundColor: '#f8cecc',
        }} />
        <div style={{
          flex: 1,
          height: 50,
          borderWidth: 1,
          borderColor: '#5ba55b',
          backgroundColor: '#d5e8d4',
        }} />
      </div>

      {/* Top-only border as separator */}
      <div style={{
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 25, backgroundColor: '#e67e22', marginBottom: 8}} />
        <div style={{
          height: 25,
          borderTopWidth: 2,
          borderTopColor: '#cccccc',
          paddingTop: 8,
          backgroundColor: '#f1c40f',
        }} />
      </div>

      {/* Nested borders */}
      <div style={{
        width: 374,
        borderWidth: 3,
        borderColor: '#333333',
        padding: 12,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{
          borderWidth: 2,
          borderColor: '#666666',
          padding: 12,
          backgroundColor: '#e0e0e0',
        }}>
          <div style={{
            borderWidth: 1,
            borderColor: '#999999',
            padding: 8,
            backgroundColor: '#d0d0d0',
          }}>
            <div style={{height: 20, backgroundColor: '#bbbbbb'}} />
          </div>
        </div>
      </div>
    </div>
  );
};
