'use strict';

var React = require('react');

module.exports = function DisplayNone() {
  return (
    <div style={{width: 390}}>
      {/* Visible element before hidden one */}
      <div style={{
        width: 200,
        height: 50,
        backgroundColor: '#ff9999',
      }} />

      {/* Hidden element — should take no space */}
      <div style={{
        display: 'none',
        width: 200,
        height: 50,
        backgroundColor: '#00ff00',
      }} />

      {/* Visible element after hidden one — should be directly below first */}
      <div style={{
        width: 200,
        height: 50,
        backgroundColor: '#9999ff',
      }} />

      {/* Hidden element inside a flex row */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 10, marginTop: 10}}>
        <div style={{width: 80, height: 40, backgroundColor: '#ffcc99'}} />
        <div style={{display: 'none', width: 80, height: 40, backgroundColor: '#cc99ff'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#99ffcc'}} />
      </div>

      {/* Container with display none hides all children */}
      <div style={{
        display: 'none',
        marginTop: 10,
        padding: 20,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 100, height: 40, backgroundColor: '#ff0000'}} />
        <p>This text should not be visible</p>
      </div>

      {/* Element after hidden container — should follow directly */}
      <div style={{
        width: 200,
        height: 50,
        marginTop: 10,
        backgroundColor: '#ffff99',
      }} />
    </div>
  );
};
