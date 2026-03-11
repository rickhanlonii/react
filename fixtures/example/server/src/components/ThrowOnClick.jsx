'use client';

const React = require('react');

function ThrowOnClick({label, message}) {
  return (
    <button onClick={() => { throw new Error(message || 'Click error'); }}>
      {label || 'Click to throw'}
    </button>
  );
}

module.exports = ThrowOnClick;
module.exports.default = ThrowOnClick;
