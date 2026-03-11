'use client';

const React = require('react');

// Track whether we've already thrown during hydration. During recovery
// (client-side re-render of the Suspense boundary), we should NOT throw
// again — otherwise the error propagates to the root and crashes the app.
let hasThrown = false;

class ThrowOnHydration extends React.Component {
  constructor(props) {
    super(props);
    // On the server this component renders fine.
    // On the client during hydration, it throws (first render only).
    // During recovery (second render), it renders normally.
    if (!hasThrown && (typeof globalThis.$$createNode !== 'undefined' || typeof window !== 'undefined')) {
      hasThrown = true;
      throw new Error(props.message || 'Hydration error');
    }
  }
  render() {
    return this.props.children || null;
  }
}

module.exports = ThrowOnHydration;
module.exports.default = ThrowOnHydration;
