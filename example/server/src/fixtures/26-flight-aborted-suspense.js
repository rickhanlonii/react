const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Aborted Suspense',
  description: 'A component that takes very long — simulates aborted rendering in the trace',
  category: 'Flight Test',
};

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function QuickSection() {
  await sleep(200);
  return (
    <div style={{backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Quick Section</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>Loaded in 200ms</p>
    </div>
  );
}

async function VerySlowSection() {
  // 30 second delay — will likely be aborted by the client or timeout
  await sleep(30000);
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Very Slow Section</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>If you see this, it was not aborted</p>
    </div>
  );
}

function Skeleton({label}) {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '60%', marginTop: 8}} />
      {label ? <p style={{color: '#8e8e93', fontSize: 13, marginTop: 8}}>{label}</p> : null}
    </div>
  );
}

function FlightAbortedSuspense() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Aborted Suspense</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          VerySlowSection (30s) will likely abort — check for 'warning' color in the trace
        </p>
      </div>
      <Suspense fallback={<Skeleton />}>
        <QuickSection />
      </Suspense>
      <Suspense fallback={<Skeleton label="Waiting for VerySlowSection (30s)..." />}>
        <VerySlowSection />
      </Suspense>
    </div>
  );
}

module.exports = FlightAbortedSuspense;
module.exports.default = FlightAbortedSuspense;
module.exports.fixture = fixture;
