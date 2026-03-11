'use strict';

var React = require('react');

module.exports = function FlexGrow() {
  return (
    <div style={{width: 390}}>
      <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
        <div style={{flexGrow: 1, height: 50, backgroundColor: '#ff9999'}} />
        <div style={{flexGrow: 2, height: 50, backgroundColor: '#99ff99'}} />
        <div style={{flexGrow: 1, height: 50, backgroundColor: '#9999ff'}} />
      </div>
      <div style={{display: 'flex', flexDirection: 'row', marginTop: 10}}>
        <div style={{width: 60, height: 40, backgroundColor: '#ffcc99'}} />
        <div style={{flexGrow: 1, height: 40, backgroundColor: '#cc99ff'}} />
      </div>
    </div>
  );
};
