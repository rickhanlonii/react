'use strict';

var React = require('react');

module.exports = function DisplayBlockVsFlexMinimal() {
  return (
    <div style={{padding: 10}}>
      {/* display:none inside a block container that is inside a flex row */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 10}}>
        <div style={{width: 120, backgroundColor: '#eeeeee', padding: 4}}>
          <div style={{height: 20, backgroundColor: '#4a90d9', marginBottom: 4}} />
          <div style={{display: 'none', height: 20, backgroundColor: '#d94a4a', marginBottom: 4}} />
          <div style={{height: 20, backgroundColor: '#90d94a'}} />
        </div>
      </div>
    </div>
  );
};
