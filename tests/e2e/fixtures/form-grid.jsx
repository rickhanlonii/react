'use strict';

var React = require('react');

module.exports = function FormGrid() {
  return (
    <div style={{width: 390, padding: 16}}>
      <h2 style={{fontSize: 18, fontWeight: 'bold'}}>Registration</h2>

      {/* Two-column row: first name + last name */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
      }}>
        <div style={{flex: 1}}>
          <label style={{fontSize: 12, color: '#555555', fontWeight: 'bold'}}>First Name</label>
          <input style={{
            width: '100%',
            height: 36,
            marginTop: 4,
            borderWidth: 1,
            borderColor: '#cccccc',
            borderRadius: 4,
            paddingLeft: 8,
            paddingRight: 8,
          }} />
        </div>
        <div style={{flex: 1}}>
          <label style={{fontSize: 12, color: '#555555', fontWeight: 'bold'}}>Last Name</label>
          <input style={{
            width: '100%',
            height: 36,
            marginTop: 4,
            borderWidth: 1,
            borderColor: '#cccccc',
            borderRadius: 4,
            paddingLeft: 8,
            paddingRight: 8,
          }} />
        </div>
      </div>

      {/* Full-width row: email */}
      <div style={{marginTop: 12}}>
        <label style={{fontSize: 12, color: '#555555', fontWeight: 'bold'}}>Email</label>
        <input style={{
          width: '100%',
          height: 36,
          marginTop: 4,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#cccccc',
          borderRadius: 4,
          paddingLeft: 8,
          paddingRight: 8,
        }} />
      </div>

      {/* Two-column row: city + zip */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
      }}>
        <div style={{flex: 2}}>
          <label style={{fontSize: 12, color: '#555555', fontWeight: 'bold'}}>City</label>
          <input style={{
            width: '100%',
            height: 36,
            marginTop: 4,
            borderWidth: 1,
            borderColor: '#cccccc',
            borderRadius: 4,
            paddingLeft: 8,
            paddingRight: 8,
          }} />
        </div>
        <div style={{flex: 1}}>
          <label style={{fontSize: 12, color: '#555555', fontWeight: 'bold'}}>Zip</label>
          <input style={{
            width: '100%',
            height: 36,
            marginTop: 4,
            borderWidth: 1,
            borderColor: '#cccccc',
            borderRadius: 4,
            paddingLeft: 8,
            paddingRight: 8,
          }} />
        </div>
      </div>

      {/* Button row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 20,
      }}>
        <div style={{
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 16,
          paddingRight: 16,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#cccccc',
          borderRadius: 4,
        }}>
          <p style={{fontSize: 14}}>Cancel</p>
        </div>
        <div style={{
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 16,
          paddingRight: 16,
          backgroundColor: '#2255aa',
          borderRadius: 4,
        }}>
          <p style={{fontSize: 14, color: '#ffffff', fontWeight: 'bold'}}>Submit</p>
        </div>
      </div>
    </div>
  );
};
