'use strict';

var React = require('react');

module.exports = function FlexShrink() {
  return (
    <div style={{width: 390}}>
      {/* Default shrink: all items shrink equally when total exceeds container */}
      <div style={{display: 'flex', flexDirection: 'row', width: 300}}>
        <div style={{width: 200, height: 50, backgroundColor: '#ff9999'}} />
        <div style={{width: 200, height: 50, backgroundColor: '#99ff99'}} />
      </div>

      {/* flexShrink: 0 prevents shrinking — item keeps its width */}
      <div style={{display: 'flex', flexDirection: 'row', width: 300, marginTop: 10}}>
        <div style={{width: 200, flexShrink: 0, height: 50, backgroundColor: '#ffcc99'}} />
        <div style={{width: 200, height: 50, backgroundColor: '#cc99ff'}} />
      </div>

      {/* Unequal shrink ratios: 1:3 */}
      <div style={{display: 'flex', flexDirection: 'row', width: 300, marginTop: 10}}>
        <div style={{width: 250, flexShrink: 1, height: 50, backgroundColor: '#99ccff'}} />
        <div style={{width: 250, flexShrink: 3, height: 50, backgroundColor: '#ffcc99'}} />
      </div>

      {/* flexBasis with flexGrow */}
      <div style={{display: 'flex', flexDirection: 'row', width: 300, marginTop: 10}}>
        <div style={{flexBasis: 100, flexGrow: 1, height: 50, backgroundColor: '#ccff99'}} />
        <div style={{flexBasis: 50, flexGrow: 2, height: 50, backgroundColor: '#ff99cc'}} />
      </div>
    </div>
  );
};
