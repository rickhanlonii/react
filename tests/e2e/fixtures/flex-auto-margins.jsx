'use strict';

var React = require('react');

module.exports = function FlexAutoMargins() {
  return (
    <div style={{width: 390}}>
      {/* marginLeft:auto pushes item to the right */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        height: 40,
        backgroundColor: '#f0f0f0',
        padding: 4,
      }}>
        <div style={{width: 50, backgroundColor: '#ff9999'}} />
        <div style={{width: 50, backgroundColor: '#99ff99'}} />
        <div style={{width: 50, marginLeft: 'auto', backgroundColor: '#9999ff'}} />
      </div>

      {/* marginRight:auto pushes everything after to the right */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        height: 40,
        marginTop: 12,
        backgroundColor: '#e8e8e8',
        padding: 4,
      }}>
        <div style={{width: 50, marginRight: 'auto', backgroundColor: '#ffaaaa'}} />
        <div style={{width: 50, backgroundColor: '#aaffaa'}} />
        <div style={{width: 50, backgroundColor: '#aaaaff'}} />
      </div>

      {/* Both auto margins — center the middle item, push others out */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        height: 40,
        marginTop: 12,
        backgroundColor: '#f5f5dc',
        padding: 4,
      }}>
        <div style={{width: 50, backgroundColor: '#eedd88'}} />
        <div style={{
          width: 50,
          marginLeft: 'auto',
          marginRight: 'auto',
          backgroundColor: '#88ddee',
        }} />
        <div style={{width: 50, backgroundColor: '#dd88ee'}} />
      </div>

      {/* marginTop:auto in column — push to bottom */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 150,
        marginTop: 12,
        backgroundColor: '#eef0ee',
        padding: 4,
      }}>
        <div style={{height: 30, backgroundColor: '#aaccaa'}} />
        <div style={{height: 30, marginTop: 'auto', backgroundColor: '#ccaacc'}} />
      </div>

      {/* Header + spacer + footer pattern using auto margins */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 120,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#dddddd',
        padding: 8,
      }}>
        <p style={{fontSize: 14, fontWeight: 'bold'}}>Title</p>
        <p style={{fontSize: 12, color: '#888888', marginTop: 4}}>Subtitle</p>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 6,
          marginTop: 'auto',
        }}>
          <div style={{
            flex: 1,
            height: 28,
            backgroundColor: '#ddeeff',
            borderRadius: 4,
          }} />
          <div style={{
            flex: 1,
            height: 28,
            backgroundColor: '#ffeedd',
            borderRadius: 4,
          }} />
        </div>
      </div>
    </div>
  );
};
