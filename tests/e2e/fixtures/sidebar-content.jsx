'use strict';

var React = require('react');

module.exports = function SidebarContent() {
  return (
    <div style={{width: 390, height: 500}}>
      {/* Top bar */}
      <div style={{
        height: 44,
        backgroundColor: '#2255aa',
        justifyContent: 'center',
        paddingLeft: 16,
      }}>
        <p style={{color: '#ffffff', fontSize: 16, fontWeight: 'bold'}}>App</p>
      </div>

      {/* Sidebar + content row */}
      <div style={{display: 'flex', flexDirection: 'row', flexGrow: 1}}>
        {/* Sidebar */}
        <div style={{
          width: 100,
          backgroundColor: '#f4f4f4',
          borderRightWidth: 1,
          borderColor: '#dddddd',
          padding: 10,
        }}>
          <div style={{
            height: 32,
            backgroundColor: '#ddeeff',
            borderRadius: 4,
            marginBottom: 6,
          }} />
          <div style={{
            height: 32,
            backgroundColor: '#ffffff',
            borderRadius: 4,
            marginBottom: 6,
          }} />
          <div style={{
            height: 32,
            backgroundColor: '#ffffff',
            borderRadius: 4,
            marginBottom: 6,
          }} />
          <div style={{
            height: 32,
            backgroundColor: '#ffffff',
            borderRadius: 4,
          }} />
        </div>

        {/* Content area */}
        <div style={{flexGrow: 1, padding: 16}}>
          <h2 style={{fontSize: 18, fontWeight: 'bold'}}>Dashboard</h2>
          <p style={{fontSize: 13, color: '#777777', marginTop: 4}}>
            Overview of recent activity
          </p>

          {/* Stats row */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 10,
            marginTop: 16,
          }}>
            <div style={{
              flex: 1,
              padding: 10,
              backgroundColor: '#eef4ff',
              borderRadius: 6,
            }}>
              <p style={{fontSize: 20, fontWeight: 'bold', color: '#2255aa'}}>42</p>
              <p style={{fontSize: 11, color: '#888888', marginTop: 2}}>Items</p>
            </div>
            <div style={{
              flex: 1,
              padding: 10,
              backgroundColor: '#eeffee',
              borderRadius: 6,
            }}>
              <p style={{fontSize: 20, fontWeight: 'bold', color: '#22aa55'}}>98</p>
              <p style={{fontSize: 11, color: '#888888', marginTop: 2}}>Score</p>
            </div>
          </div>

          {/* Content placeholder */}
          <div style={{
            height: 80,
            marginTop: 12,
            backgroundColor: '#f8f8f8',
            borderRadius: 4,
            borderWidth: 1,
            borderColor: '#eeeeee',
          }} />
        </div>
      </div>
    </div>
  );
};
