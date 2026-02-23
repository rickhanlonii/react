const React = require('react');
const {Suspense} = React;
const ThrowOnHydration = require('../components/ThrowOnHydration');
const HydrationMismatch = require('../components/HydrationMismatch');

const fixture = {
  title: 'Recoverable Errors',
  description: 'Hydration mismatches where React recovers by falling back to client render',
  category: 'Error Handling',
};

function RecoverableErrors() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Recoverable Errors</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Hydration mismatches — React falls back to client render
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Text Mismatch</h3>
        <p style={{color: '#8e8e93', fontSize: 13, marginTop: 0}}>
          Server renders "Server", client renders "Client"
        </p>
        <HydrationMismatch serverText="Server" clientText="Client" />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Suspense Recovery</h3>
        <p style={{color: '#8e8e93', fontSize: 13, marginTop: 0}}>
          Hydration error inside Suspense — React falls back to client render
        </p>
        <Suspense fallback={<p style={{color: '#8e8e93', marginTop: 0}}>Loading...</p>}>
          <ThrowOnHydration message="Recoverable hydration error inside Suspense">
            <p style={{color: '#1c1c1e', marginTop: 0}}>This renders on the server, then recovers on the client</p>
          </ThrowOnHydration>
        </Suspense>
      </div>
    </div>
  );
}

module.exports = RecoverableErrors;
module.exports.default = RecoverableErrors;
module.exports.fixture = fixture;
