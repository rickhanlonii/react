'use strict';

var React = require('react');

module.exports = function FlexAlignExtras() {
  return (
    <div style={{width: 390}}>
      {/* justifyContent: space-around */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-around',
        height: 50,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 50, height: 30, backgroundColor: '#ff9999'}} />
        <div style={{width: 50, height: 30, backgroundColor: '#99ff99'}} />
        <div style={{width: 50, height: 30, backgroundColor: '#9999ff'}} />
      </div>

      {/* justifyContent: space-evenly */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        height: 50,
        marginTop: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 50, height: 30, backgroundColor: '#ffcc99'}} />
        <div style={{width: 50, height: 30, backgroundColor: '#cc99ff'}} />
        <div style={{width: 50, height: 30, backgroundColor: '#99ffcc'}} />
      </div>

      {/* alignSelf overrides */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        height: 100,
        marginTop: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 60, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{width: 60, height: 40, alignSelf: 'center', backgroundColor: '#99ff99'}} />
        <div style={{width: 60, height: 40, alignSelf: 'flex-end', backgroundColor: '#9999ff'}} />
        <div style={{width: 60, alignSelf: 'stretch', backgroundColor: '#ffff99'}} />
      </div>

      {/* alignSelf in column direction */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginTop: 10,
        backgroundColor: '#eeeeee',
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#ffaaaa'}} />
        <div style={{width: 100, height: 30, alignSelf: 'center', backgroundColor: '#aaffaa'}} />
        <div style={{width: 100, height: 30, alignSelf: 'flex-end', backgroundColor: '#aaaaff'}} />
        <div style={{height: 30, alignSelf: 'stretch', backgroundColor: '#ffddaa'}} />
      </div>
    </div>
  );
};
