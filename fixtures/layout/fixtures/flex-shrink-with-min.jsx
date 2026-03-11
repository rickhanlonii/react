'use strict';

var React = require('react');

module.exports = function FlexShrinkWithMin() {
  return (
    <div style={{padding: 10, gap: 16}}>
      {/* 1. flexShrink respects minWidth */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 200}}>
          <div style={{width: 150, minWidth: 100, flexShrink: 1, height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{width: 150, minWidth: 100, flexShrink: 1, height: 40, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 2. One item has minWidth, other shrinks fully */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 200}}>
          <div style={{width: 150, minWidth: 120, flexShrink: 1, height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{width: 150, flexShrink: 1, height: 40, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 3. flexShrink: 0 prevents shrinking */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 200}}>
          <div style={{width: 120, flexShrink: 0, height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{width: 120, flexShrink: 1, height: 40, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 4. Different shrink ratios */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 200}}>
          <div style={{width: 150, flexShrink: 1, height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{width: 150, flexShrink: 3, height: 40, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 5. minHeight in flex column with shrink */}
      <div>
        <div style={{display: 'flex', flexDirection: 'column', width: 150, height: 100}}>
          <div style={{height: 80, minHeight: 50, flexShrink: 1, backgroundColor: '#4a90d9'}} />
          <div style={{height: 80, minHeight: 50, flexShrink: 1, backgroundColor: '#d94a4a'}} />
        </div>
      </div>

      {/* 6. Three items shrinking with different minWidths */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 250}}>
          <div style={{width: 120, minWidth: 80, flexShrink: 1, height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{width: 120, minWidth: 60, flexShrink: 1, height: 40, backgroundColor: '#d94a4a'}} />
          <div style={{width: 120, minWidth: 40, flexShrink: 1, height: 40, backgroundColor: '#90d94a'}} />
        </div>
      </div>

      {/* 7. flexShrink with flexBasis and minWidth */}
      <div>
        <div style={{display: 'flex', flexDirection: 'row', width: 200}}>
          <div style={{flexBasis: 150, minWidth: 80, flexShrink: 1, height: 40, backgroundColor: '#4a90d9'}} />
          <div style={{flexBasis: 150, minWidth: 80, flexShrink: 2, height: 40, backgroundColor: '#d94a4a'}} />
        </div>
      </div>
    </div>
  );
};
