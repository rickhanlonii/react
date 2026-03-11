'use strict';

var React = require('react');

module.exports = function NegativeMargin() {
  return (
    <div style={{padding: 8}}>
      {/* Negative marginTop pulls element up */}
      <div style={{
        width: 374,
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{height: 40, backgroundColor: '#d94a4a', marginTop: -10, opacity: 0.8}} />
      </div>

      {/* Negative marginLeft pulls element left */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        marginBottom: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', marginLeft: -20, opacity: 0.8}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Negative margin on all sides */}
      <div style={{
        backgroundColor: '#f0f0f0',
        padding: 30,
        width: 374,
        marginBottom: 8,
      }}>
        <div style={{
          height: 40,
          backgroundColor: '#9b59b6',
          marginTop: -15,
          marginLeft: -15,
          marginRight: -15,
        }} />
      </div>

      {/* Stacked overlapping cards */}
      <div style={{
        width: 374,
        marginBottom: 8,
      }}>
        <div style={{
          height: 50,
          backgroundColor: '#4a90d9',
          borderRadius: 4,
          padding: 8,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Card 1</p>
        </div>
        <div style={{
          height: 50,
          backgroundColor: '#5ba55b',
          borderRadius: 4,
          padding: 8,
          marginTop: -15,
          marginLeft: 20,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Card 2</p>
        </div>
        <div style={{
          height: 50,
          backgroundColor: '#d94a4a',
          borderRadius: 4,
          padding: 8,
          marginTop: -15,
          marginLeft: 40,
        }}>
          <p style={{margin: 0, fontSize: 12, color: '#ffffff'}}>Card 3</p>
        </div>
      </div>

      {/* Negative marginBottom pulls next element up */}
      <div style={{
        width: 374,
        marginBottom: 8,
      }}>
        <div style={{height: 40, backgroundColor: '#e67e22', marginBottom: -20}} />
        <div style={{height: 40, backgroundColor: '#1abc9c', opacity: 0.8}} />
      </div>

      {/* Negative margin in flex row with gap */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: 374,
        gap: 16,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', marginLeft: -8}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a'}} />
      </div>
    </div>
  );
};
