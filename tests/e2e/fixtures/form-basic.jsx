'use strict';

var React = require('react');

module.exports = function FormBasic() {
  return (
    <div style={{width: 390, padding: 10}}>
      <form>
        <div style={{marginBottom: 12}}>
          <label>Username</label>
          <input placeholder="Enter username" />
        </div>
        <div style={{marginBottom: 12}}>
          <label>Email</label>
          <input placeholder="Enter email" />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 10,
        }}>
          <button>Submit</button>
          <button>Cancel</button>
        </div>
      </form>
    </div>
  );
};
