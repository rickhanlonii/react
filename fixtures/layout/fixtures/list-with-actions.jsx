'use strict';

var React = require('react');

module.exports = function ListWithActions() {
  return (
    <div style={{width: 390, padding: 12}}>
      {/* List item: text left, action right */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderStyle: 'solid',
        borderColor: '#eeeeee',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#ddeeff',
        }} />
        <div style={{flex: 1, marginLeft: 10}}>
          <p style={{fontSize: 15, fontWeight: 'bold'}}>Item One</p>
          <p style={{fontSize: 12, color: '#888888'}}>Description text</p>
        </div>
        <div style={{
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 10,
          paddingRight: 10,
          backgroundColor: '#eef4ff',
          borderRadius: 4,
        }}>
          <p style={{fontSize: 12, color: '#2255aa'}}>View</p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderStyle: 'solid',
        borderColor: '#eeeeee',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#ffeedd',
        }} />
        <div style={{flex: 1, marginLeft: 10}}>
          <p style={{fontSize: 15, fontWeight: 'bold'}}>Item Two</p>
          <p style={{fontSize: 12, color: '#888888'}}>Another description</p>
        </div>
        <div style={{
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 10,
          paddingRight: 10,
          backgroundColor: '#eef4ff',
          borderRadius: 4,
        }}>
          <p style={{fontSize: 12, color: '#2255aa'}}>View</p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderStyle: 'solid',
        borderColor: '#eeeeee',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#eeffdd',
        }} />
        <div style={{flex: 1, marginLeft: 10}}>
          <p style={{fontSize: 15, fontWeight: 'bold'}}>Item Three</p>
          <p style={{fontSize: 12, color: '#888888'}}>Third item details</p>
        </div>
        <div style={{display: 'flex', flexDirection: 'row', gap: 6}}>
          <div style={{
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 10,
            paddingRight: 10,
            backgroundColor: '#ffeeee',
            borderRadius: 4,
          }}>
            <p style={{fontSize: 12, color: '#cc3333'}}>Delete</p>
          </div>
          <div style={{
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 10,
            paddingRight: 10,
            backgroundColor: '#eef4ff',
            borderRadius: 4,
          }}>
            <p style={{fontSize: 12, color: '#2255aa'}}>Edit</p>
          </div>
        </div>
      </div>

      {/* Item with badge count */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#ffffff',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#ffeeff',
        }} />
        <div style={{flex: 1, marginLeft: 10}}>
          <p style={{fontSize: 15, fontWeight: 'bold'}}>Messages</p>
          <p style={{fontSize: 12, color: '#888888'}}>Unread messages</p>
        </div>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: '#ff4444',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <p style={{fontSize: 11, color: '#ffffff', fontWeight: 'bold'}}>3</p>
        </div>
      </div>
    </div>
  );
};
