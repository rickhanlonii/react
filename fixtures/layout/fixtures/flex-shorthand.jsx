'use strict';

var React = require('react');

module.exports = function FlexShorthand() {
  return (
    <div style={{width: 390}}>
      {/* flex: 1 on all children — equal distribution */}
      <div style={{display: 'flex', flexDirection: 'row', height: 40}}>
        <div style={{flex: 1, backgroundColor: '#ff9999'}} />
        <div style={{flex: 1, backgroundColor: '#99ff99'}} />
        <div style={{flex: 1, backgroundColor: '#9999ff'}} />
      </div>

      {/* flex: 1 vs flex: 2 — proportional distribution */}
      <div style={{display: 'flex', flexDirection: 'row', height: 40, marginTop: 12}}>
        <div style={{flex: 1, backgroundColor: '#ffaaaa'}} />
        <div style={{flex: 2, backgroundColor: '#aaffaa'}} />
        <div style={{flex: 1, backgroundColor: '#aaaaff'}} />
      </div>

      {/* flex: 0 (no grow) + flex: 1 (takes remaining) */}
      <div style={{display: 'flex', flexDirection: 'row', height: 40, marginTop: 12}}>
        <div style={{width: 80, flex: 0, backgroundColor: '#ffccaa'}} />
        <div style={{flex: 1, backgroundColor: '#aaccff'}} />
      </div>

      {/* flex in column direction */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 150,
        marginTop: 12,
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{flex: 1, backgroundColor: '#eecccc'}} />
        <div style={{flex: 2, backgroundColor: '#cceecc'}} />
        <div style={{flex: 1, backgroundColor: '#ccccee'}} />
      </div>

      {/* flex: 1 with padding — padding included */}
      <div style={{display: 'flex', flexDirection: 'row', height: 50, marginTop: 12}}>
        <div style={{flex: 1, padding: 8, backgroundColor: '#ffe0e0'}}>
          <div style={{height: 20, backgroundColor: '#cc8888'}} />
        </div>
        <div style={{flex: 1, padding: 8, backgroundColor: '#e0ffe0'}}>
          <div style={{height: 20, backgroundColor: '#88cc88'}} />
        </div>
      </div>

      {/* Mixed: fixed width + flex: 1 + fixed width */}
      <div style={{display: 'flex', flexDirection: 'row', height: 40, marginTop: 12}}>
        <div style={{width: 60, backgroundColor: '#ddaadd'}} />
        <div style={{flex: 1, backgroundColor: '#aaddaa'}} />
        <div style={{width: 60, backgroundColor: '#aadddd'}} />
      </div>
    </div>
  );
};
