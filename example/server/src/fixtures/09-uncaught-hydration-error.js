const React = require('react');
const ThrowOnHydration = require('../components/ThrowOnHydration');

const fixture = {
  title: 'Uncaught Hydration Error',
  description: 'Client component throws during hydration with no ErrorBoundary',
  category: 'Error Handling',
};

function UncaughtHydrationError() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Uncaught Hydration Error</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          No ErrorBoundary — hydration error propagates to root
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <ThrowOnHydration message="Uncaught hydration error">
          <p style={{color: '#1c1c1e', marginTop: 0}}>This text renders on the server</p>
        </ThrowOnHydration>
      </div>
    </div>
  );
}

module.exports = UncaughtHydrationError;
module.exports.default = UncaughtHydrationError;
module.exports.fixture = fixture;
