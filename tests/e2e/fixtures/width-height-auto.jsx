'use strict';

var React = require('react');

module.exports = function WidthHeightAuto() {
  return (
    <div style={{padding: 8}}>
      {/* Auto width: block element stretches to parent width */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 30, backgroundColor: '#4a90d9'}} />
      </div>

      {/* Auto height: container sized by children */}
      <div style={{
        width: 374,
        backgroundColor: '#dae8fc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{height: 20, backgroundColor: '#4a90d9', marginBottom: 4}} />
        <div style={{height: 30, backgroundColor: '#5ba55b', marginBottom: 4}} />
        <div style={{height: 40, backgroundColor: '#e67e22'}} />
      </div>

      {/* Auto width in flex row: items sized by content */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
        marginBottom: 8,
        gap: 8,
      }}>
        <div style={{width: 50, height: 40, backgroundColor: '#5ba55b'}} />
        <div style={{height: 40, backgroundColor: '#27ae60', padding: 8}}>
          <div style={{width: 80, height: 24, backgroundColor: '#1abc9c'}} />
        </div>
        <div style={{width: 30, height: 40, backgroundColor: '#2ecc71'}} />
      </div>

      {/* Auto height in flex column: each child auto-height from its content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
        gap: 4,
      }}>
        <div style={{backgroundColor: '#e67e22', padding: 8}}>
          <div style={{height: 15, backgroundColor: '#d35400'}} />
        </div>
        <div style={{backgroundColor: '#d94a4a', padding: 12}}>
          <div style={{height: 10, backgroundColor: '#c0392b'}} />
        </div>
        <div style={{backgroundColor: '#f1c40f', padding: 4}}>
          <div style={{height: 20, backgroundColor: '#f39c12'}} />
        </div>
      </div>

      {/* Mixed: some children have explicit size, others auto */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <div style={{width: 80, height: 60, backgroundColor: '#9b59b6'}} />
        <div style={{backgroundColor: '#8e44ad', padding: 8}}>
          <div style={{width: 40, height: 20, backgroundColor: '#7d3c98', marginBottom: 4}} />
          <div style={{width: 60, height: 20, backgroundColor: '#6c3483'}} />
        </div>
        <div style={{width: 80, height: 40, backgroundColor: '#a569bd'}} />
      </div>

      {/* Auto width with maxWidth constraint */}
      <div style={{
        width: 374,
        backgroundColor: '#f8cecc',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{maxWidth: 200, backgroundColor: '#d94a4a', padding: 8}}>
          <div style={{width: 300, height: 25, backgroundColor: '#e57373'}} />
        </div>
      </div>

      {/* Nested auto sizing: grandchild determines grandparent height */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        backgroundColor: '#e8f5e9',
        padding: 8,
        gap: 8,
      }}>
        <div style={{flex: 1, backgroundColor: '#c8e6c9', padding: 8}}>
          <div style={{backgroundColor: '#a5d6a7', padding: 8}}>
            <div style={{height: 50, backgroundColor: '#81c784'}} />
          </div>
        </div>
        <div style={{flex: 1, backgroundColor: '#c8e6c9', padding: 8}}>
          <div style={{backgroundColor: '#a5d6a7', padding: 8}}>
            <div style={{height: 20, backgroundColor: '#81c784'}} />
          </div>
        </div>
      </div>
    </div>
  );
};
