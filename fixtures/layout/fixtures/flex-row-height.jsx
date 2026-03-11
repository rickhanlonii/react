'use strict';

var React = require('react');

module.exports = function FlexRowHeight() {
  return (
    <div style={{width: 390}}>
      {/* Default: items stretch to tallest (alignItems: stretch) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        padding: 8,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{flex: 1, height: 30, backgroundColor: '#ff9999'}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#99ff99'}} />
        <div style={{flex: 1, height: 45, backgroundColor: '#9999ff'}} />
      </div>

      {/* alignItems: stretch — children without height fill row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{flex: 1, backgroundColor: '#ffaaaa'}}>
          <p style={{fontSize: 12, padding: 4}}>Short</p>
        </div>
        <div style={{flex: 1, backgroundColor: '#aaffaa'}}>
          <p style={{fontSize: 12, padding: 4}}>Taller content that takes more vertical space</p>
        </div>
        <div style={{flex: 1, backgroundColor: '#aaaaff'}}>
          <p style={{fontSize: 12, padding: 4}}>Med</p>
        </div>
      </div>

      {/* alignItems: flex-start — items at natural height */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f5f5dc',
      }}>
        <div style={{flex: 1, height: 30, backgroundColor: '#ddcc88'}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#88ccdd'}} />
        <div style={{flex: 1, height: 45, backgroundColor: '#cc88dd'}} />
      </div>

      {/* alignItems: flex-end — items aligned to bottom */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#eef0ee',
      }}>
        <div style={{flex: 1, height: 30, backgroundColor: '#aaccaa'}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#ccaacc'}} />
        <div style={{flex: 1, height: 45, backgroundColor: '#ccccaa'}} />
      </div>

      {/* alignItems: center — items vertically centered */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f0eef0',
      }}>
        <div style={{flex: 1, height: 20, backgroundColor: '#ddaadd'}} />
        <div style={{flex: 1, height: 60, backgroundColor: '#aaddaa'}} />
        <div style={{flex: 1, height: 40, backgroundColor: '#aadddd'}} />
      </div>

      {/* Mixed: alignItems with alignSelf overrides */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#fff5ee',
      }}>
        <div style={{flex: 1, height: 30, backgroundColor: '#ffccaa'}} />
        <div style={{
          flex: 1,
          height: 30,
          alignSelf: 'center',
          backgroundColor: '#aaccff',
        }} />
        <div style={{
          flex: 1,
          height: 30,
          alignSelf: 'flex-end',
          backgroundColor: '#ffaacc',
        }} />
      </div>
    </div>
  );
};
