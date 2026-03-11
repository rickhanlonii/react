const React = require('react');
const {Suspense} = React;
const ThrowOnServer = require('../components/ThrowOnServer');

const fixture = {
  title: 'Server Render Errors',
  description: 'React recovers from server errors by falling back to client render',
  category: 'Error Handling',
};

function RecoverableErrors() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Suspense Recovery</h3>
        <p style={{color: '#8e8e93', fontSize: 13, marginTop: 0}}>
          Server error inside Suspense — React falls back to client render
        </p>
        <Suspense fallback={<p style={{color: '#8e8e93', marginTop: 0}}>Loading...</p>}>
          <ThrowOnServer message="Error on server">
            <p style={{color: '#1c1c1e', marginTop: 0}}>This renders on the server, then recovers on the client</p>
          </ThrowOnServer>
        </Suspense>
      </div>
    </div>
  );
}

module.exports = RecoverableErrors;
module.exports.default = RecoverableErrors;
module.exports.fixture = fixture;
