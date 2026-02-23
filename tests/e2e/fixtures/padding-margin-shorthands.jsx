'use strict';

var React = require('react');

module.exports = function BoxSizingInteractions() {
  return (
    <div style={{width: 390}}>
      {/* Padding shorthand + per-side overrides */}
      <div style={{
        padding: 10,
        paddingLeft: 30,
        paddingRight: 30,
        backgroundColor: '#ffeeee',
      }}>
        <div style={{height: 30, backgroundColor: '#ff9999'}} />
      </div>

      {/* Margin shorthand + per-side overrides */}
      <div style={{
        margin: 10,
        marginTop: 20,
        marginBottom: 5,
        height: 30,
        backgroundColor: '#eeffee',
      }} />

      {/* Padding + border + content: total size */}
      <div style={{
        width: 200,
        padding: 15,
        borderWidth: 3,
        borderStyle: 'solid',
        borderColor: '#999999',
        backgroundColor: '#eeeeff',
        marginTop: 10,
      }}>
        <div style={{height: 30, backgroundColor: '#9999ff'}} />
      </div>

      {/* Large padding on all sides */}
      <div style={{
        paddingTop: 5,
        paddingRight: 40,
        paddingBottom: 25,
        paddingLeft: 40,
        marginTop: 10,
        backgroundColor: '#ffffee',
      }}>
        <div style={{height: 30, backgroundColor: '#dddd88'}} />
      </div>

      {/* Width with different padding per side in flex row */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 8, marginTop: 10}}>
        <div style={{
          flexGrow: 1,
          padding: 8,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#aaaaaa',
          backgroundColor: '#ffeedd',
        }}>
          <div style={{height: 30, backgroundColor: '#ddbb99'}} />
        </div>
        <div style={{
          flexGrow: 1,
          padding: 16,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#aaaaaa',
          backgroundColor: '#ddeeff',
        }}>
          <div style={{height: 30, backgroundColor: '#99bbdd'}} />
        </div>
      </div>

      {/* Nested padding accumulation */}
      <div style={{
        padding: 12,
        marginTop: 10,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{
          padding: 12,
          backgroundColor: '#dddddd',
        }}>
          <div style={{
            padding: 12,
            backgroundColor: '#bbbbbb',
          }}>
            <div style={{height: 20, backgroundColor: '#999999'}} />
          </div>
        </div>
      </div>

      {/* Zero padding and zero margin (explicit reset) */}
      <div style={{
        padding: 0,
        margin: 0,
        marginTop: 10,
        backgroundColor: '#ffcccc',
      }}>
        <div style={{height: 30, backgroundColor: '#ee9999'}} />
      </div>
    </div>
  );
};
