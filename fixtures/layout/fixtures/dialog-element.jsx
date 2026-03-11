'use strict';

var React = require('react');

module.exports = function DialogElement() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic dialog */}
      <dialog>
        <p>This is a basic dialog box.</p>
      </dialog>

      {/* Dialog with custom styling */}
      <dialog style={{
        marginTop: 16,
        borderColor: '#3366cc',
        borderWidth: 2,
        borderRadius: 8,
        backgroundColor: '#f0f0ff',
        paddingTop: 20,
        paddingBottom: 20,
        paddingLeft: 24,
        paddingRight: 24,
      }}>
        <h3 style={{marginTop: 0}}>Dialog Title</h3>
        <p>Dialog content with custom border and background.</p>
      </dialog>

      {/* Dialog with form-like content */}
      <dialog style={{marginTop: 16, width: 300}}>
        <p style={{fontWeight: 'bold', marginTop: 0}}>Confirm Action</p>
        <p>Are you sure you want to proceed?</p>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8, justifyContent: 'flex-end'}}>
          <button>Cancel</button>
          <button style={{backgroundColor: '#3366cc', color: '#ffffff'}}>OK</button>
        </div>
      </dialog>
    </div>
  );
};
