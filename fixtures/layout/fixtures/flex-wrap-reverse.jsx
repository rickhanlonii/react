'use strict';

var React = require('react');

module.exports = function FlexWrapReverse() {
  return (
    <div>
      {/* wrap-reverse: items wrap upward */}
      <div style={{
        width: 200,
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap-reverse',
        gap: 8,
        padding: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#99ff99'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9999ff'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#ffcc99'}} />
      </div>
      {/* wrap-reverse with alignItems */}
      <div style={{
        width: 200,
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap-reverse',
        alignItems: 'center',
        gap: 6,
        padding: 10,
        backgroundColor: '#dddddd',
        marginTop: 10,
      }}>
        <div style={{width: 80, height: 30, backgroundColor: '#cc99ff'}} />
        <div style={{width: 80, height: 50, backgroundColor: '#99ccff'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#ffcc99'}} />
      </div>
    </div>
  );
};
