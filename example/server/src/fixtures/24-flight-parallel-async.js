const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Parallel Async',
  description: 'Overlapping async components showing parallel tracks and concurrent await entries',
  category: 'Flight Test',
};

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function ParallelSection({label, delay, color}) {
  await sleep(delay);
  return (
    <div style={{backgroundColor: color || '#ffffff', borderRadius: 12, padding: 16, flex: 1}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>{label}</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>
        {delay}ms
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16, flex: 1}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 80}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '50%', marginTop: 8}} />
    </div>
  );
}

function FlightParallelAsync() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Parallel Async</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Sibling async components render in parallel — check for multiple tracks in the trace
        </p>
      </div>
      <Suspense fallback={<div style={{display: 'flex', gap: 12}}><Skeleton /><Skeleton /></div>}>
        <div style={{display: 'flex', gap: 12}}>
          <ParallelSection label="Left" delay={500} color="#e8f5e9" />
          <ParallelSection label="Right" delay={1500} color="#e3f2fd" />
        </div>
      </Suspense>
      <Suspense fallback={<div style={{display: 'flex', gap: 12}}><Skeleton /><Skeleton /><Skeleton /></div>}>
        <div style={{display: 'flex', gap: 12}}>
          <ParallelSection label="A" delay={300} color="#fff3e0" />
          <ParallelSection label="B" delay={600} color="#fce4ec" />
          <ParallelSection label="C" delay={900} color="#f3e5f5" />
        </div>
      </Suspense>
    </div>
  );
}

module.exports = FlightParallelAsync;
module.exports.default = FlightParallelAsync;
module.exports.fixture = fixture;
