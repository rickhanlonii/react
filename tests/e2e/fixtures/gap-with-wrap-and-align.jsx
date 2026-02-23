'use strict';

var React = require('react');

module.exports = function GapWithWrapAndAlign() {
  return (
    <div style={{padding: 8}}>
      {/* Row gap + wrap + alignItems center */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        width: 200,
        backgroundColor: '#eeeeee',
        padding: 8,
        marginBottom: 12
      }}>
        <div style={{width: 80, height: 30, backgroundColor: '#4a90d9'}} />
        <div style={{width: 80, height: 50, backgroundColor: '#d94a4a'}} />
        <div style={{width: 80, height: 20, backgroundColor: '#4ad94a'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9d94a'}} />
      </div>

      {/* Row gap + wrap + alignContent center */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        alignContent: 'center',
        height: 160,
        width: 200,
        backgroundColor: '#dddddd',
        padding: 8,
        marginBottom: 12
      }}>
        <div style={{width: 80, height: 30, backgroundColor: '#9b59b6'}} />
        <div style={{width: 80, height: 30, backgroundColor: '#e67e22'}} />
        <div style={{width: 80, height: 30, backgroundColor: '#1abc9c'}} />
        <div style={{width: 80, height: 30, backgroundColor: '#e74c3c'}} />
      </div>

      {/* Row gap + wrap + alignContent space-between + alignItems flex-end */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        alignContent: 'space-between',
        alignItems: 'flex-end',
        height: 140,
        width: 200,
        backgroundColor: '#cccccc',
        padding: 8,
        marginBottom: 12
      }}>
        <div style={{width: 60, height: 20, backgroundColor: '#3498db'}} />
        <div style={{width: 60, height: 40, backgroundColor: '#2ecc71'}} />
        <div style={{width: 60, height: 25, backgroundColor: '#f39c12'}} />
        <div style={{width: 60, height: 35, backgroundColor: '#e74c3c'}} />
        <div style={{width: 60, height: 15, backgroundColor: '#9b59b6'}} />
      </div>

      {/* rowGap != columnGap + wrap + alignItems stretch */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 16,
        columnGap: 4,
        alignItems: 'stretch',
        width: 200,
        backgroundColor: '#bbbbbb',
        padding: 8,
        marginBottom: 12
      }}>
        <div style={{width: 90, height: 30, backgroundColor: '#2c3e50'}} />
        <div style={{width: 90, height: 30, backgroundColor: '#c0392b'}} />
        <div style={{width: 90, height: 30, backgroundColor: '#27ae60'}} />
        <div style={{width: 90, height: 30, backgroundColor: '#2980b9'}} />
      </div>

      {/* Large gap + wrap + alignContent flex-end */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 20,
        alignContent: 'flex-end',
        height: 150,
        width: 200,
        backgroundColor: '#aaaaaa',
        padding: 8
      }}>
        <div style={{width: 70, height: 25, backgroundColor: '#16a085'}} />
        <div style={{width: 70, height: 25, backgroundColor: '#8e44ad'}} />
        <div style={{width: 70, height: 25, backgroundColor: '#d35400'}} />
        <div style={{width: 70, height: 25, backgroundColor: '#2c3e50'}} />
      </div>
    </div>
  );
};
