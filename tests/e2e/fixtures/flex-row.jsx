'use strict';

var React = require('react');

module.exports = function FlexRow() {
  return (
    <div style={{width: 300, display: 'flex', flexDirection: 'row', gap: 10}}>
      <div style={{width: 80, height: 80, backgroundColor: '#ff9999'}} />
      <div style={{width: 80, height: 80, backgroundColor: '#99ff99'}} />
      <div style={{width: 80, height: 80, backgroundColor: '#9999ff'}} />
    </div>
  );
};
