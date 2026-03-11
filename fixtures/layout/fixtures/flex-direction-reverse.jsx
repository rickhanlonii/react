'use strict';

var React = require('react');

module.exports = function FlexDirectionReverse() {
  return (
    <div style={{width: 390}}>
      {/* row-reverse: items should appear right-to-left */}
      <div style={{display: 'flex', flexDirection: 'row-reverse', gap: 8}}>
        <div style={{width: 60, height: 50, backgroundColor: '#ff9999'}} />
        <div style={{width: 60, height: 50, backgroundColor: '#99ff99'}} />
        <div style={{width: 60, height: 50, backgroundColor: '#9999ff'}} />
      </div>

      {/* column-reverse: items should appear bottom-to-top */}
      <div style={{display: 'flex', flexDirection: 'column-reverse', marginTop: 10}}>
        <div style={{width: 200, height: 40, backgroundColor: '#ffcc99'}} />
        <div style={{width: 200, height: 40, backgroundColor: '#cc99ff'}} />
        <div style={{width: 200, height: 40, backgroundColor: '#99ffcc'}} />
      </div>

      {/* row-reverse with flexGrow */}
      <div style={{display: 'flex', flexDirection: 'row-reverse', marginTop: 10}}>
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#ffaaaa'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#aaffaa'}} />
      </div>

      {/* column-reverse with gap */}
      <div style={{display: 'flex', flexDirection: 'column-reverse', gap: 8, marginTop: 10}}>
        <div style={{width: 150, height: 30, backgroundColor: '#aaaaff'}} />
        <div style={{width: 150, height: 30, backgroundColor: '#ffddaa'}} />
        <div style={{width: 150, height: 30, backgroundColor: '#ddaaff'}} />
      </div>
    </div>
  );
};
