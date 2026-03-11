const React = require('react');
const ThrowOnClick = require('../components/ThrowOnClick');

const fixture = {
  title: 'Uncaught Interaction Error',
  description: 'Client component throws on click with no ErrorBoundary',
  category: 'Error Handling',
};

function UncaughtInteractionError() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Uncaught Interaction Error</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          No ErrorBoundary — click error propagates to root
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <ThrowOnClick label="Click to throw (uncaught)" message="Uncaught interaction error" />
      </div>
    </div>
  );
}

module.exports = UncaughtInteractionError;
module.exports.default = UncaughtInteractionError;
module.exports.fixture = fixture;
