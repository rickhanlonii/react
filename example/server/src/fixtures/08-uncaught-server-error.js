const React = require('react');

const fixture = {
  title: 'Uncaught Server Error',
  description: 'Server component throws with no ErrorBoundary — tests root-level error handling',
  category: 'Error Handling',
};

async function ThrowingServerComponent() {
  throw new Error('Uncaught server component error');
}

function UncaughtServerError() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Uncaught Server Error</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          No ErrorBoundary — error propagates to root
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <ThrowingServerComponent />
      </div>
    </div>
  );
}

module.exports = UncaughtServerError;
module.exports.default = UncaughtServerError;
module.exports.fixture = fixture;
