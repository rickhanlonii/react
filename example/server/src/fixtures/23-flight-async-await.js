const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Sequential Loading',
  description: 'Three cards loading one after another at increasing delays',
  category: 'Loading Patterns',
};

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function DataSection({label, delay}) {
  await sleep(delay);
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>{label}</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>
        Loaded after {delay}ms
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '60%', marginTop: 8}} />
    </div>
  );
}

function FlightAsyncAwait() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Sequential Loading</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Three cards loading one after another at increasing delays
        </p>
      </div>
      <Suspense fallback={<Skeleton />}>
        <DataSection label="Fast Section (200ms)" delay={200} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <DataSection label="Medium Section (800ms)" delay={800} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <DataSection label="Slow Section (2000ms)" delay={2000} />
      </Suspense>
    </div>
  );
}

module.exports = FlightAsyncAwait;
module.exports.default = FlightAsyncAwait;
module.exports.fixture = fixture;
