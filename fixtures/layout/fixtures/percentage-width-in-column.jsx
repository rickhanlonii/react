'use strict';

var React = require('react');

module.exports = function PercentageWidthInColumn() {
  return (
    <div style={{padding: 10, gap: 16}}>
      {/* 1. Percentage widths in block parent */}
      <div>
        <div style={{width: 300, backgroundColor: '#eeeeee', padding: 4, gap: 4}}>
          <div style={{width: '100%', height: 25, backgroundColor: '#4a90d9'}} />
          <div style={{width: '75%', height: 25, backgroundColor: '#d94a4a'}} />
          <div style={{width: '50%', height: 25, backgroundColor: '#90d94a'}} />
          <div style={{width: '25%', height: 25, backgroundColor: '#d9904a'}} />
        </div>
      </div>

      {/* 2. Percentage widths in flex column */}
      <div>
        <div style={{display: 'flex', flexDirection: 'column', width: 300, backgroundColor: '#eeeeee', padding: 4, gap: 4}}>
          <div style={{width: '100%', height: 25, backgroundColor: '#4a90d9'}} />
          <div style={{width: '75%', height: 25, backgroundColor: '#d94a4a'}} />
          <div style={{width: '50%', height: 25, backgroundColor: '#90d94a'}} />
          <div style={{width: '25%', height: 25, backgroundColor: '#d9904a'}} />
        </div>
      </div>

      {/* 3. Percentage heights in fixed-height flex column */}
      <div>
        <div style={{display: 'flex', flexDirection: 'column', width: 200, height: 120, backgroundColor: '#eeeeee', padding: 4}}>
          <div style={{height: '50%', backgroundColor: '#4a90d9'}} />
          <div style={{height: '25%', backgroundColor: '#d94a4a'}} />
          <div style={{height: '25%', backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 4. Mixed percentage + fixed widths */}
      <div>
        <div style={{display: 'flex', flexDirection: 'column', width: 280, backgroundColor: '#eeeeee', padding: 4, gap: 4}}>
          <div style={{width: '60%', height: 25, backgroundColor: '#4a90d9'}} />
          <div style={{width: 100, height: 25, backgroundColor: '#d94a4a'}} />
          <div style={{width: '80%', height: 25, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 5. Percentage width with padding */}
      <div>
        <div style={{width: 300, backgroundColor: '#eeeeee', padding: 4}}>
          <div style={{width: '50%', height: 30, padding: 8, backgroundColor: '#4a90d9'}} />
        </div>
      </div>

      {/* 6. Nested percentage widths */}
      <div>
        <div style={{width: 300, backgroundColor: '#cccccc', padding: 4}}>
          <div style={{width: '80%', backgroundColor: '#dddddd', padding: 4}}>
            <div style={{width: '50%', height: 25, backgroundColor: '#4a90d9'}} />
          </div>
        </div>
      </div>

      {/* 7. Percentage width in flex row */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 300, backgroundColor: '#eeeeee', padding: 4, gap: 4}}>
          <div style={{width: '30%', height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{width: '50%', height: 40, backgroundColor: '#d94a4a'}} />
          <div style={{width: '20%', height: 40, backgroundColor: '#90d94a'}} />
        </div>
      </div>
    </div>
  );
};
