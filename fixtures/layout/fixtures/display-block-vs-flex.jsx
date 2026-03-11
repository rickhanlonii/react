'use strict';

var React = require('react');

module.exports = function DisplayBlockVsFlex() {
  return (
    <div style={{padding: 10, gap: 20}}>
      {/* 1. display:block — children stack vertically, stretch full width */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>display: block (default div)</p>
        <div style={{width: 250, backgroundColor: '#eeeeee', padding: 8}}>
          <div style={{height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#d94a4a', marginBottom: 4}} />
          <div style={{height: 30, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 2. display:flex — children don't stretch width by default in column */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>display: flex, column</p>
        <div style={{display: 'flex', flexDirection: 'column', width: 250, backgroundColor: '#eeeeee', padding: 8, gap: 4}}>
          <div style={{height: 30, backgroundColor: '#4a90d9'}} />
          <div style={{height: 30, backgroundColor: '#d94a4a'}} />
          <div style={{height: 30, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 3. display:flex row — children sit side by side */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>display: flex, row</p>
        <div style={{display: 'flex', flexDirection: 'row', width: 250, backgroundColor: '#eeeeee', padding: 8, gap: 4}}>
          <div style={{width: 60, height: 30, backgroundColor: '#4a90d9'}} />
          <div style={{width: 60, height: 30, backgroundColor: '#d94a4a'}} />
          <div style={{width: 60, height: 30, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 4. block children with explicit widths — don't stretch */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>block with explicit child widths</p>
        <div style={{width: 250, backgroundColor: '#eeeeee', padding: 8}}>
          <div style={{width: 100, height: 30, backgroundColor: '#4a90d9', marginBottom: 4}} />
          <div style={{width: 150, height: 30, backgroundColor: '#d94a4a', marginBottom: 4}} />
          <div style={{width: 200, height: 30, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 5. flex column with flexGrow — children share vertical space */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>flex column + flexGrow in fixed height</p>
        <div style={{display: 'flex', flexDirection: 'column', width: 200, height: 120, backgroundColor: '#eeeeee', padding: 4, gap: 4}}>
          <div style={{flexGrow: 1, backgroundColor: '#4a90d9'}} />
          <div style={{flexGrow: 2, backgroundColor: '#d94a4a'}} />
          <div style={{flexGrow: 1, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 6. display:none inside block vs flex */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>hidden child in block vs flex</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 10}}>
          <div style={{width: 120, backgroundColor: '#eeeeee', padding: 4}}>
            <div style={{height: 20, backgroundColor: '#4a90d9', marginBottom: 4}} />
            <div style={{display: 'none', height: 20, backgroundColor: '#d94a4a', marginBottom: 4}} />
            <div style={{height: 20, backgroundColor: '#90d94a'}} />
          </div>
          <div style={{display: 'flex', flexDirection: 'column', width: 120, backgroundColor: '#eeeeee', padding: 4, gap: 4}}>
            <div style={{height: 20, backgroundColor: '#4a90d9'}} />
            <div style={{display: 'none', height: 20, backgroundColor: '#d94a4a'}} />
            <div style={{height: 20, backgroundColor: '#90d94a'}} />
          </div>
        </div>
      </div>
    </div>
  );
};
