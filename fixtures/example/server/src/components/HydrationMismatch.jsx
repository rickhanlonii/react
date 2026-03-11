'use client';

const React = require('react');

function HydrationMismatch({serverText, clientText}) {
  // On the server this renders serverText.
  // On the client this renders clientText, causing a hydration mismatch.
  return React.createElement('p', {
    style: {color: '#1c1c1e', marginTop: 0},
  }, Date.now());
}

module.exports = HydrationMismatch;
module.exports.default = HydrationMismatch;
