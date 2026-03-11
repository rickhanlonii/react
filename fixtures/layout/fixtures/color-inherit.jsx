'use strict';

var React = require('react');

module.exports = function ColorInherit() {
  return (
    <div style={{padding: 8}}>
      {/* Color set on parent div, inherited by children */}
      <div style={{
        color: '#d94a4a',
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14}}>Inherits red from parent</p>
        <p style={{margin: 0, fontSize: 14}}>Also inherits red</p>
      </div>

      {/* Child overriding inherited color */}
      <div style={{
        color: '#4a90d9',
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14}}>Inherits blue</p>
        <p style={{margin: 0, fontSize: 14, color: '#5ba55b'}}>Overrides to green</p>
        <p style={{margin: 0, fontSize: 14}}>Back to blue</p>
      </div>

      {/* Nested containers with different colors */}
      <div style={{
        color: '#d94a4a',
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14, marginBottom: 4}}>Red from outer</p>
        <div style={{color: '#4a90d9', backgroundColor: '#e8e8e8', padding: 8}}>
          <p style={{margin: 0, fontSize: 14, marginBottom: 4}}>Blue from inner</p>
          <div style={{backgroundColor: '#dddddd', padding: 8}}>
            <p style={{margin: 0, fontSize: 14}}>Still blue (inherited)</p>
          </div>
        </div>
      </div>

      {/* Color on heading elements */}
      <div style={{
        color: '#9b59b6',
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <h3 style={{margin: 0, marginBottom: 4}}>Purple heading</h3>
        <p style={{margin: 0, fontSize: 14}}>Purple paragraph</p>
      </div>

      {/* Color with inline spans */}
      <div style={{
        color: '#333333',
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{margin: 0, fontSize: 14}}>
          Dark text <span style={{color: '#d94a4a'}}>red span</span> dark again.
        </p>
      </div>

      {/* Multiple nesting levels */}
      <div style={{
        color: '#e67e22',
        backgroundColor: '#eeeeee',
        padding: 8,
      }}>
        <p style={{margin: 0, fontSize: 14, marginBottom: 4}}>Orange level 1</p>
        <div style={{padding: 4, backgroundColor: '#e0e0e0'}}>
          <p style={{margin: 0, fontSize: 14, marginBottom: 4}}>Orange level 2</p>
          <div style={{color: '#1abc9c', padding: 4, backgroundColor: '#d0d0d0'}}>
            <p style={{margin: 0, fontSize: 14, marginBottom: 4}}>Teal level 3</p>
            <p style={{margin: 0, fontSize: 14, color: '#e67e22'}}>Override back to orange</p>
          </div>
        </div>
      </div>
    </div>
  );
};
