'use strict';

var React = require('react');

module.exports = function BoxSizingModes() {
  return (
    <div style={{padding: 10, gap: 20}}>
      {/* 1. content-box (default): padding adds to total size */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>content-box (default)</p>
        <div style={{width: 200, height: 50, padding: 20, backgroundColor: '#4a90d9', borderStyle: 'solid', borderWidth: 2, borderColor: '#333333'}} />
      </div>

      {/* 2. border-box: padding included in declared size */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box</p>
        <div style={{boxSizing: 'border-box', width: 200, height: 50, padding: 20, backgroundColor: '#d94a4a', borderStyle: 'solid', borderWidth: 2, borderColor: '#333333'}} />
      </div>

      {/* 3. Side-by-side comparison: same declared width, different total */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>same width: 150, padding: 15</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 10}}>
          <div style={{width: 150, height: 40, padding: 15, backgroundColor: '#4a90d9'}} />
          <div style={{boxSizing: 'border-box', width: 150, height: 40, padding: 15, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 4. border-box with thick borders */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box + thick border</p>
        <div style={{boxSizing: 'border-box', width: 200, height: 60, padding: 10, borderStyle: 'solid', borderWidth: 8, borderColor: '#666666', backgroundColor: '#90d94a'}} />
      </div>

      {/* 5. content-box with thick borders */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>content-box + thick border</p>
        <div style={{width: 200, height: 60, padding: 10, borderStyle: 'solid', borderWidth: 8, borderColor: '#666666', backgroundColor: '#d9904a'}} />
      </div>

      {/* 6. Nested: parent border-box, child content-box */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>nested: border-box parent, content-box child</p>
        <div style={{boxSizing: 'border-box', width: 250, height: 80, padding: 15, backgroundColor: '#dddddd'}}>
          <div style={{width: 100, height: 30, padding: 10, backgroundColor: '#4a90d9'}} />
        </div>
      </div>
    </div>
  );
};
