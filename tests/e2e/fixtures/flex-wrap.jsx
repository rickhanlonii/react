'use strict';

var React = require('react');

module.exports = function FlexWrap() {
  return (
    <div style={{
      width: 200,
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 10,
      backgroundColor: '#eeeeee',
    }}>
      <div style={{width: 80, height: 40, backgroundColor: '#ff9999'}} />
      <div style={{width: 80, height: 40, backgroundColor: '#99ff99'}} />
      <div style={{width: 80, height: 40, backgroundColor: '#9999ff'}} />
      <div style={{width: 80, height: 40, backgroundColor: '#ffcc99'}} />
      <div style={{width: 80, height: 40, backgroundColor: '#cc99ff'}} />
    </div>
  );
};
