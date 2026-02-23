'use strict';

var React = require('react');

module.exports = function BorderBoxInFlex() {
  return (
    <div style={{padding: 10, gap: 16}}>
      {/* 1. border-box children in flex row — padding inside declared width */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box in flex row</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <div style={{boxSizing: 'border-box', width: 100, height: 40, padding: 10, backgroundColor: '#4a90d9'}} />
          <div style={{boxSizing: 'border-box', width: 100, height: 40, padding: 10, backgroundColor: '#d94a4a'}} />
          <div style={{boxSizing: 'border-box', width: 100, height: 40, padding: 10, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 2. content-box children in same flex row — padding adds to width */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>content-box in flex row (wider)</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <div style={{width: 100, height: 40, padding: 10, backgroundColor: '#4a90d9'}} />
          <div style={{width: 100, height: 40, padding: 10, backgroundColor: '#d94a4a'}} />
          <div style={{width: 100, height: 40, padding: 10, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 3. border-box with flexGrow */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box + flexGrow</p>
        <div style={{display: 'flex', flexDirection: 'row', width: 300}}>
          <div style={{boxSizing: 'border-box', flexGrow: 1, height: 40, padding: 15, backgroundColor: '#4a90d9'}} />
          <div style={{boxSizing: 'border-box', flexGrow: 2, height: 40, padding: 15, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 4. border-box with flexBasis */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box + flexBasis:150 + padding:20</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <div style={{boxSizing: 'border-box', flexBasis: 150, height: 40, padding: 20, backgroundColor: '#4a90d9'}} />
          <div style={{flexBasis: 150, height: 40, padding: 20, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 5. border-box with border + padding in flex */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box + border + padding in flex</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <div style={{boxSizing: 'border-box', width: 120, height: 50, padding: 10, borderStyle: 'solid', borderWidth: 3, borderColor: '#333333', backgroundColor: '#4a90d9'}} />
          <div style={{boxSizing: 'border-box', width: 120, height: 50, padding: 10, borderStyle: 'solid', borderWidth: 3, borderColor: '#333333', backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 6. Mixed box-sizing siblings in flex */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>mixed: border-box + content-box siblings</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'flex-start'}}>
          <div style={{boxSizing: 'border-box', width: 100, height: 50, padding: 12, backgroundColor: '#4a90d9'}} />
          <div style={{width: 100, height: 50, padding: 12, backgroundColor: '#d94a4a'}} />
          <div style={{boxSizing: 'border-box', width: 100, height: 50, padding: 12, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 7. border-box in flex column */}
      <div>
        <p style={{fontSize: 12, marginBottom: 4}}>border-box in flex column</p>
        <div style={{display: 'flex', flexDirection: 'column', width: 200, gap: 4}}>
          <div style={{boxSizing: 'border-box', height: 40, padding: 10, backgroundColor: '#4a90d9'}} />
          <div style={{boxSizing: 'border-box', height: 40, padding: 10, borderStyle: 'solid', borderWidth: 2, borderColor: '#333333', backgroundColor: '#d94a4a'}} />
          <div style={{boxSizing: 'border-box', height: 40, padding: 10, backgroundColor: '#90d94a'}} />
        </div>
      </div>
    </div>
  );
};
