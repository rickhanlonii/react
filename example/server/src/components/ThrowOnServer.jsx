'use client';

const React = require('react');

class ThrowOnServer extends React.Component {
  constructor(props) {
    super(props);
    // On the server this component renders fine.
    // On the client during hydration, it throws.
    if (typeof globalThis.$$createNode === 'undefined' && typeof window === 'undefined') {
      throw new Error(props.message || 'Hydration error');
    }
  }
  render() {
    return this.props.children || null;
  }
}

module.exports = ThrowOnServer;
module.exports.default = ThrowOnServer;
