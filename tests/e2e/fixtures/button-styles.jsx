'use strict';

var React = require('react');

module.exports = function ButtonStyles() {
  return (
    <div style={{width: 390, padding: 16}}>
      {/* Basic button with background */}
      <button style={{
        width: '100%',
        height: 44,
        backgroundColor: '#2255aa',
        borderWidth: 0,
        borderRadius: 6,
      }}>
        <p style={{color: '#ffffff', fontSize: 16, fontWeight: 'bold', textAlign: 'center'}}>Primary Button</p>
      </button>

      {/* Outline button */}
      <button style={{
        width: '100%',
        height: 44,
        marginTop: 10,
        backgroundColor: '#ffffff',
        borderWidth: 2,
        borderColor: '#2255aa',
        borderRadius: 6,
      }}>
        <p style={{color: '#2255aa', fontSize: 16, textAlign: 'center'}}>Outline Button</p>
      </button>

      {/* Small and large buttons side by side */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
      }}>
        <button style={{
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 10,
          paddingRight: 10,
          backgroundColor: '#22aa55',
          borderWidth: 0,
          borderRadius: 4,
        }}>
          <p style={{color: '#ffffff', fontSize: 12}}>Small</p>
        </button>
        <button style={{
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 20,
          paddingRight: 20,
          backgroundColor: '#22aa55',
          borderWidth: 0,
          borderRadius: 6,
        }}>
          <p style={{color: '#ffffff', fontSize: 14}}>Medium</p>
        </button>
        <button style={{
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 28,
          paddingRight: 28,
          backgroundColor: '#22aa55',
          borderWidth: 0,
          borderRadius: 8,
        }}>
          <p style={{color: '#ffffff', fontSize: 16}}>Large</p>
        </button>
      </div>

      {/* Pill buttons */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
      }}>
        <button style={{
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 16,
          paddingRight: 16,
          backgroundColor: '#ee5a24',
          borderWidth: 0,
          borderRadius: 20,
        }}>
          <p style={{color: '#ffffff', fontSize: 13}}>Danger</p>
        </button>
        <button style={{
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 16,
          paddingRight: 16,
          backgroundColor: '#f0f0f0',
          borderWidth: 0,
          borderRadius: 20,
        }}>
          <p style={{fontSize: 13, color: '#555555'}}>Disabled</p>
        </button>
      </div>

      {/* Full-width button group (vertical) */}
      <div style={{marginTop: 16, gap: 6}}>
        <button style={{
          width: '100%',
          height: 40,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#dddddd',
          borderRadius: 6,
        }}>
          <p style={{fontSize: 14, textAlign: 'center'}}>Option A</p>
        </button>
        <button style={{
          width: '100%',
          height: 40,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#dddddd',
          borderRadius: 6,
        }}>
          <p style={{fontSize: 14, textAlign: 'center'}}>Option B</p>
        </button>
        <button style={{
          width: '100%',
          height: 40,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#dddddd',
          borderRadius: 6,
        }}>
          <p style={{fontSize: 14, textAlign: 'center'}}>Option C</p>
        </button>
      </div>

      {/* Icon + text button pattern */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
      }}>
        <button style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 12,
          paddingRight: 12,
          backgroundColor: '#2255aa',
          borderWidth: 0,
          borderRadius: 6,
        }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#ffffff44',
          }} />
          <p style={{color: '#ffffff', fontSize: 13}}>Add Item</p>
        </button>
        <button style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 12,
          paddingRight: 12,
          backgroundColor: '#cc3333',
          borderWidth: 0,
          borderRadius: 6,
        }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#ffffff44',
          }} />
          <p style={{color: '#ffffff', fontSize: 13}}>Remove</p>
        </button>
      </div>
    </div>
  );
};
