'use strict';

var React = require('react');

module.exports = function BackgroundLayers() {
  return (
    <div style={{width: 390}}>
      {/* Nested backgrounds creating depth */}
      <div style={{padding: 16, backgroundColor: '#1a1a2e'}}>
        <div style={{padding: 16, backgroundColor: '#16213e'}}>
          <div style={{padding: 16, backgroundColor: '#0f3460'}}>
            <div style={{padding: 16, backgroundColor: '#533483'}}>
              <p style={{color: '#ffffff', fontSize: 14, textAlign: 'center'}}>Deep</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alternating light/dark rows */}
      <div style={{marginTop: 12}}>
        <div style={{padding: 10, backgroundColor: '#ffffff'}}>
          <p style={{fontSize: 14}}>Row 1</p>
        </div>
        <div style={{padding: 10, backgroundColor: '#f5f5f5'}}>
          <p style={{fontSize: 14}}>Row 2</p>
        </div>
        <div style={{padding: 10, backgroundColor: '#ffffff'}}>
          <p style={{fontSize: 14}}>Row 3</p>
        </div>
        <div style={{padding: 10, backgroundColor: '#f5f5f5'}}>
          <p style={{fontSize: 14}}>Row 4</p>
        </div>
        <div style={{padding: 10, backgroundColor: '#ffffff'}}>
          <p style={{fontSize: 14}}>Row 5</p>
        </div>
      </div>

      {/* Color blocks in grid */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
      }}>
        <div style={{width: '25%', height: 60, backgroundColor: '#ff6b6b'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#feca57'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#48dbfb'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#ff9ff3'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#54a0ff'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#5f27cd'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#01a3a4'}} />
        <div style={{width: '25%', height: 60, backgroundColor: '#f368e0'}} />
      </div>

      {/* Card with colored header */}
      <div style={{
        marginTop: 12,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#dddddd',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          height: 40,
          backgroundColor: '#ee5a24',
          justifyContent: 'center',
          paddingLeft: 12,
        }}>
          <p style={{color: '#ffffff', fontSize: 14, fontWeight: 'bold'}}>Alert</p>
        </div>
        <div style={{padding: 12, backgroundColor: '#ffffff'}}>
          <p style={{fontSize: 13, color: '#555555'}}>Card body with white background.</p>
        </div>
      </div>

      {/* Subtle background tints in sidebar items */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        padding: 8,
        backgroundColor: '#f8f8f8',
      }}>
        <div style={{flex: 1, padding: 10, backgroundColor: '#eef4ff', borderRadius: 6}}>
          <p style={{fontSize: 12, color: '#2255aa'}}>Info</p>
        </div>
        <div style={{flex: 1, padding: 10, backgroundColor: '#eeffee', borderRadius: 6}}>
          <p style={{fontSize: 12, color: '#22aa55'}}>Success</p>
        </div>
        <div style={{flex: 1, padding: 10, backgroundColor: '#fff8ee', borderRadius: 6}}>
          <p style={{fontSize: 12, color: '#cc8800'}}>Warning</p>
        </div>
        <div style={{flex: 1, padding: 10, backgroundColor: '#ffeeee', borderRadius: 6}}>
          <p style={{fontSize: 12, color: '#cc3333'}}>Error</p>
        </div>
      </div>
    </div>
  );
};
