'use strict';

var React = require('react');

module.exports = function MarginPaddingCombos() {
  return (
    <div style={{padding: 10, gap: 16}}>
      {/* 1. Uniform margin vs per-side margin */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>uniform margin:20 vs per-side</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 10}}>
          <div style={{backgroundColor: '#eeeeee'}}>
            <div style={{margin: 20, width: 60, height: 30, backgroundColor: '#4a90d9'}} />
          </div>
          <div style={{backgroundColor: '#eeeeee'}}>
            <div style={{marginTop: 10, marginRight: 30, marginBottom: 5, marginLeft: 15, width: 60, height: 30, backgroundColor: '#d94a4a'}} />
          </div>
        </div>
      </div>

      {/* 2. Uniform padding vs per-side padding */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>uniform padding:15 vs per-side</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 10}}>
          <div style={{padding: 15, backgroundColor: '#eeeeee'}}>
            <div style={{width: 60, height: 30, backgroundColor: '#4a90d9'}} />
          </div>
          <div style={{paddingTop: 5, paddingRight: 25, paddingBottom: 20, paddingLeft: 10, backgroundColor: '#eeeeee'}}>
            <div style={{width: 60, height: 30, backgroundColor: '#d94a4a'}} />
          </div>
        </div>
      </div>

      {/* 3. Margin + padding combined */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>margin:10 + padding:15 combined</p>
        <div style={{backgroundColor: '#dddddd'}}>
          <div style={{margin: 10, padding: 15, backgroundColor: '#eeeeee'}}>
            <div style={{width: 80, height: 30, backgroundColor: '#90d94a'}} />
          </div>
        </div>
      </div>

      {/* 4. Per-side overrides on uniform */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>padding:10 + paddingLeft:30 override</p>
        <div style={{padding: 10, paddingLeft: 30, backgroundColor: '#eeeeee'}}>
          <div style={{height: 30, backgroundColor: '#4a90d9'}} />
        </div>
      </div>

      {/* 5. margin:0 reset on element with default margins */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>p with margin:0 vs default</p>
        <div style={{backgroundColor: '#eeeeee', padding: 4}}>
          <p style={{fontSize: 14}}>Default p margins</p>
          <p style={{fontSize: 14, margin: 0}}>p with margin:0</p>
          <p style={{fontSize: 14, margin: 0}}>p with margin:0</p>
        </div>
      </div>

      {/* 6. Nested padding accumulation */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>nested padding: 15 + 10 + 5</p>
        <div style={{padding: 15, backgroundColor: '#cccccc'}}>
          <div style={{padding: 10, backgroundColor: '#dddddd'}}>
            <div style={{padding: 5, backgroundColor: '#eeeeee'}}>
              <div style={{height: 20, backgroundColor: '#4a90d9'}} />
            </div>
          </div>
        </div>
      </div>

      {/* 7. Large asymmetric padding */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>asymmetric: paddingLeft:50, paddingTop:5</p>
        <div style={{paddingLeft: 50, paddingTop: 5, paddingRight: 10, paddingBottom: 20, backgroundColor: '#eeeeee'}}>
          <div style={{height: 30, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 8. Margin auto centering in block context */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>marginLeft:auto + marginRight:auto centering</p>
        <div style={{width: 250, backgroundColor: '#eeeeee', padding: 4}}>
          <div style={{width: 100, height: 30, marginLeft: 'auto', marginRight: 'auto', backgroundColor: '#90d94a'}} />
        </div>
      </div>
    </div>
  );
};
