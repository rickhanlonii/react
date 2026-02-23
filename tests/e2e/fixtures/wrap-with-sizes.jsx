'use strict';

var React = require('react');

module.exports = function WrapWithSizes() {
  return (
    <div style={{width: 390}}>
      {/* Varying widths that wrap naturally */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        padding: 8,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{width: 120, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#99ff99'}} />
        <div style={{width: 150, height: 40, backgroundColor: '#9999ff'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#ffff99'}} />
        <div style={{width: 90, height: 40, backgroundColor: '#ff99ff'}} />
        <div style={{width: 130, height: 40, backgroundColor: '#99ffff'}} />
      </div>

      {/* Varying heights in wrapping row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#e8e8e8',
      }}>
        <div style={{width: 100, height: 30, backgroundColor: '#ffaaaa'}} />
        <div style={{width: 100, height: 50, backgroundColor: '#aaffaa'}} />
        <div style={{width: 100, height: 40, backgroundColor: '#aaaaff'}} />
        <div style={{width: 100, height: 60, backgroundColor: '#ffffaa'}} />
        <div style={{width: 100, height: 35, backgroundColor: '#ffaaff'}} />
        <div style={{width: 100, height: 45, backgroundColor: '#aaffff'}} />
      </div>

      {/* Wrap with flexGrow items */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f5f5dc',
      }}>
        <div style={{
          minWidth: 150,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#ddcc88',
        }} />
        <div style={{
          minWidth: 150,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#88ccdd',
        }} />
        <div style={{
          minWidth: 150,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#cc88dd',
        }} />
      </div>

      {/* Tag/chip wrap pattern */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 12,
        padding: 8,
      }}>
        <div style={{
          paddingTop: 4, paddingBottom: 4,
          paddingLeft: 10, paddingRight: 10,
          backgroundColor: '#eef4ff',
          borderRadius: 12,
        }}>
          <p style={{fontSize: 12, color: '#2255aa'}}>React</p>
        </div>
        <div style={{
          paddingTop: 4, paddingBottom: 4,
          paddingLeft: 10, paddingRight: 10,
          backgroundColor: '#eeffee',
          borderRadius: 12,
        }}>
          <p style={{fontSize: 12, color: '#22aa55'}}>Swift</p>
        </div>
        <div style={{
          paddingTop: 4, paddingBottom: 4,
          paddingLeft: 10, paddingRight: 10,
          backgroundColor: '#fff8ee',
          borderRadius: 12,
        }}>
          <p style={{fontSize: 12, color: '#cc8800'}}>JavaScript</p>
        </div>
        <div style={{
          paddingTop: 4, paddingBottom: 4,
          paddingLeft: 10, paddingRight: 10,
          backgroundColor: '#ffeeee',
          borderRadius: 12,
        }}>
          <p style={{fontSize: 12, color: '#cc3333'}}>TypeScript</p>
        </div>
        <div style={{
          paddingTop: 4, paddingBottom: 4,
          paddingLeft: 10, paddingRight: 10,
          backgroundColor: '#f0eeff',
          borderRadius: 12,
        }}>
          <p style={{fontSize: 12, color: '#5533cc'}}>UIKit</p>
        </div>
        <div style={{
          paddingTop: 4, paddingBottom: 4,
          paddingLeft: 10, paddingRight: 10,
          backgroundColor: '#eef0ee',
          borderRadius: 12,
        }}>
          <p style={{fontSize: 12, color: '#448844'}}>Yoga</p>
        </div>
      </div>
    </div>
  );
};
