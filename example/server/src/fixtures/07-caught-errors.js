const React = require('react');
const {Suspense} = React;
const ErrorBoundary = require('../components/ErrorBoundary');
const ThrowOnHydration = require('../components/ThrowOnHydration');
const ThrowOnClick = require('../components/ThrowOnClick');

const fixture = {
  title: 'Caught Errors',
  description: 'ErrorBoundary catches server, hydration, and interaction errors',
  category: 'Error Handling',
};

async function ThrowingServerComponent() {
  throw new Error('Server component error');
}

function CaughtErrors() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Caught Errors</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          ErrorBoundary catches errors from three sources
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Server Error (caught)</h3>
        <ErrorBoundary>
          <ThrowingServerComponent />
        </ErrorBoundary>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Hydration Error (caught)</h3>
        <ErrorBoundary>
          <ThrowOnHydration message="Hydration error in caught boundary">
            <p style={{color: '#1c1c1e', marginTop: 0}}>This text renders on the server</p>
          </ThrowOnHydration>
        </ErrorBoundary>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Interaction Error (caught)</h3>
        <ErrorBoundary>
          <ThrowOnClick label="Click to throw (caught)" message="Interaction error in caught boundary" />
        </ErrorBoundary>
      </div>
    </div>
  );
}

module.exports = CaughtErrors;
module.exports.default = CaughtErrors;
module.exports.fixture = fixture;
