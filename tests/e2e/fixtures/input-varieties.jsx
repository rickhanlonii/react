'use strict';

var React = require('react');

module.exports = function InputVarieties() {
  return (
    <div style={{width: 390, padding: 16}}>
      {/* Basic input with border */}
      <input style={{
        width: '100%',
        height: 40,
        borderWidth: 1,
        borderColor: '#cccccc',
        borderRadius: 4,
        paddingLeft: 10,
        paddingRight: 10,
        fontSize: 14,
      }} />

      {/* Thick bordered input */}
      <input style={{
        width: '100%',
        height: 44,
        marginTop: 12,
        borderWidth: 2,
        borderColor: '#2255aa',
        borderRadius: 8,
        paddingLeft: 12,
        paddingRight: 12,
        fontSize: 16,
      }} />

      {/* Input with background color */}
      <input style={{
        width: '100%',
        height: 40,
        marginTop: 12,
        backgroundColor: '#f5f5f5',
        borderWidth: 0,
        borderRadius: 6,
        paddingLeft: 10,
        paddingRight: 10,
        fontSize: 14,
      }} />

      {/* Inline label + input in flex row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
      }}>
        <label style={{fontSize: 14, width: 60}}>Name</label>
        <input style={{
          flex: 1,
          height: 36,
          borderWidth: 1,
          borderColor: '#cccccc',
          borderRadius: 4,
          paddingLeft: 8,
          paddingRight: 8,
        }} />
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
      }}>
        <label style={{fontSize: 14, width: 60}}>Email</label>
        <input style={{
          flex: 1,
          height: 36,
          borderWidth: 1,
          borderColor: '#cccccc',
          borderRadius: 4,
          paddingLeft: 8,
          paddingRight: 8,
        }} />
      </div>

      {/* Small + large inputs side by side */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
      }}>
        <input style={{
          flex: 1,
          height: 32,
          borderWidth: 1,
          borderColor: '#dddddd',
          borderRadius: 4,
          paddingLeft: 6,
          paddingRight: 6,
          fontSize: 12,
        }} />
        <input style={{
          flex: 2,
          height: 32,
          borderWidth: 1,
          borderColor: '#dddddd',
          borderRadius: 4,
          paddingLeft: 6,
          paddingRight: 6,
          fontSize: 12,
        }} />
      </div>

      {/* Input + button combo */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop: 12,
      }}>
        <input style={{
          flex: 1,
          height: 40,
          borderWidth: 1,
          borderColor: '#cccccc',
          borderTopLeftRadius: 6,
          borderBottomLeftRadius: 6,
          paddingLeft: 10,
          paddingRight: 10,
          fontSize: 14,
        }} />
        <button style={{
          width: 80,
          height: 40,
          backgroundColor: '#2255aa',
          borderWidth: 0,
          borderTopRightRadius: 6,
          borderBottomRightRadius: 6,
        }}>
          <p style={{color: '#ffffff', fontSize: 14, fontWeight: 'bold'}}>Go</p>
        </button>
      </div>
    </div>
  );
};
