const React = require('react');
const {Suspense} = React;
const ErrorBoundary = require('../components/ErrorBoundary');

const fixture = {
  title: 'Error Recovery',
  description: 'A successful card alongside a failing card caught by an error boundary',
  category: 'Loading Patterns',
};

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function SuccessSection() {
  await sleep(200);
  return (
    <div style={{backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Success</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>This component rendered normally</p>
    </div>
  );
}

async function FailingSection() {
  await sleep(500);
  throw new Error('Server component failed after 500ms');
}

function Skeleton() {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '60%', marginTop: 8}} />
    </div>
  );
}

function FlightServerError() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Error Recovery</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          One card loads successfully, the other fails and is caught by an error boundary
        </p>
      </div>
      <Suspense fallback={<Skeleton />}>
        <SuccessSection />
      </Suspense>
      <ErrorBoundary>
        <Suspense fallback={<Skeleton />}>
          <FailingSection />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

module.exports = FlightServerError;
module.exports.default = FlightServerError;
module.exports.fixture = fixture;
