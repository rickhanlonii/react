'use strict';

var React = require('react');

module.exports = function BorderRadiusPercentage() {
  return (
    <div style={{padding: 8}}>
      {/* 50% border radius on square = circle */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        marginBottom: 8,
      }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          backgroundColor: '#4a90d9',
        }} />
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: '#5ba55b',
        }} />
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          backgroundColor: '#d94a4a',
        }} />
      </div>

      {/* 50% on rectangle = ellipse/pill */}
      <div style={{
        width: 200,
        height: 50,
        borderRadius: '50%',
        backgroundColor: '#9b59b6',
        marginBottom: 8,
      }} />

      {/* 25% border radius */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '25%',
          backgroundColor: '#e67e22',
        }} />
        <div style={{
          width: 120,
          height: 60,
          borderRadius: '25%',
          backgroundColor: '#1abc9c',
        }} />
      </div>

      {/* Small percentage radius */}
      <div style={{
        width: 374,
        height: 50,
        borderRadius: '10%',
        backgroundColor: '#f0f0f0',
        borderWidth: 2,
        borderColor: '#999999',
        marginBottom: 8,
      }} />

      {/* Percentage radius with content */}
      <div style={{
        width: 200,
        height: 200,
        borderRadius: '50%',
        backgroundColor: '#dae8fc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        overflow: 'hidden',
      }}>
        <div style={{fontSize: 14, fontWeight: 'bold', color: '#4a90d9'}}>Circle</div>
      </div>

      {/* Per-corner percentage radius */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 80,
          height: 80,
          borderTopLeftRadius: '50%',
          backgroundColor: '#f8cecc',
        }} />
        <div style={{
          width: 80,
          height: 80,
          borderTopRightRadius: '50%',
          borderBottomLeftRadius: '50%',
          backgroundColor: '#d5e8d4',
        }} />
      </div>

      {/* Fixed vs percentage radius comparison */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
      }}>
        <div style={{
          width: 100,
          height: 100,
          borderRadius: 20,
          backgroundColor: '#fff3cd',
          borderWidth: 2,
          borderColor: '#e67e22',
        }} />
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '20%',
          backgroundColor: '#fff3cd',
          borderWidth: 2,
          borderColor: '#9b59b6',
        }} />
      </div>
    </div>
  );
};
