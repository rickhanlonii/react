'use strict';

var React = require('react');

module.exports = function FixedHeightColumn() {
  return (
    <div style={{padding: 8}}>
      {/* Column with fixed height, children grow to fill */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 200,
        width: 374,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{flexGrow: 1, backgroundColor: '#4a90d9', margin: 4}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Grow 1</p>
        </div>
        <div style={{flexGrow: 2, backgroundColor: '#5ba55b', margin: 4}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Grow 2</p>
        </div>
        <div style={{flexGrow: 1, backgroundColor: '#d94a4a', margin: 4}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Grow 1</p>
        </div>
      </div>

      {/* Column with fixed height, one child fixed, rest grow */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 200,
        width: 374,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Fixed 40</p>
        </div>
        <div style={{flexGrow: 1, backgroundColor: '#5ba55b'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Grows</p>
        </div>
        <div style={{height: 40, backgroundColor: '#d94a4a'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Fixed 40</p>
        </div>
      </div>

      {/* Column with fixed height, children shrink */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 120,
        width: 374,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{height: 60, flexShrink: 1, backgroundColor: '#9b59b6'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Shrink 1</p>
        </div>
        <div style={{height: 60, flexShrink: 2, backgroundColor: '#e67e22'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Shrink 2</p>
        </div>
        <div style={{height: 60, flexShrink: 1, backgroundColor: '#1abc9c'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Shrink 1</p>
        </div>
      </div>

      {/* Column with gap and fixed height */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 200,
        width: 374,
        backgroundColor: '#f0f0f0',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{flexGrow: 1, backgroundColor: '#4a90d9'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Equal 1</p>
        </div>
        <div style={{flexGrow: 1, backgroundColor: '#5ba55b'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Equal 2</p>
        </div>
        <div style={{flexGrow: 1, backgroundColor: '#d94a4a'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Equal 3</p>
        </div>
      </div>

      {/* Column with justifyContent space-between */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: 200,
        width: 374,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Top</p>
        </div>
        <div style={{height: 40, backgroundColor: '#5ba55b'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Middle</p>
        </div>
        <div style={{height: 40, backgroundColor: '#d94a4a'}}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff', padding: 4}}>Bottom</p>
        </div>
      </div>
    </div>
  );
};
