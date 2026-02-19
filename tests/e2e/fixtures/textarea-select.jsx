'use strict';

var React = require('react');

module.exports = function TextareaSelect() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic textarea */}
      <label>Comment</label>
      <textarea />

      {/* Textarea with custom size */}
      <label style={{marginTop: 16}}>Description</label>
      <textarea style={{width: 300, minHeight: 80}} />

      {/* Textarea with custom styling */}
      <textarea style={{
        width: 300,
        minHeight: 60,
        marginTop: 16,
        borderColor: '#3366cc',
        borderWidth: 2,
        borderRadius: 8,
        padding: 8,
        backgroundColor: '#f8f8ff',
      }} />

      {/* Basic select */}
      <div style={{marginTop: 16}}>
        <label>Category</label>
        <select style={{marginLeft: 8}} />
      </div>

      {/* Select with custom width */}
      <div style={{marginTop: 12}}>
        <label>Priority</label>
        <select style={{width: 200, marginLeft: 8}} />
      </div>

      {/* Form row: textarea + select side by side */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
      }}>
        <textarea style={{flexGrow: 1, minHeight: 60}} />
        <div>
          <select style={{width: 100}} />
          <select style={{width: 100, marginTop: 8}} />
        </div>
      </div>

      {/* Full form with label + textarea + select + button */}
      <div style={{
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
      }}>
        <label style={{fontWeight: 'bold'}}>Feedback Form</label>
        <textarea style={{width: '100%', minHeight: 50, marginTop: 8}} />
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
        }}>
          <select style={{flexGrow: 1}} />
          <button>Submit</button>
        </div>
      </div>
    </div>
  );
};
