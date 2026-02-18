'use strict';

var React = require('react');

module.exports = function FlexAlign() {
  return (
    <div style={{
      width: 390,
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 10,
    }}>
      <div style={{width: 60, height: 40, backgroundColor: '#ff9999'}} />
      <div style={{width: 80, height: 60, backgroundColor: '#99ff99'}} />
      <div style={{width: 50, height: 50, backgroundColor: '#9999ff'}} />
    </div>
  );
};
