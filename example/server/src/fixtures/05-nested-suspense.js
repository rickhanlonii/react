const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Nested Suspense',
  description: 'Multiple nested Suspense boundaries with staggered delays',
  category: 'Suspense',
};

async function SlowSection({label, delay}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>{label}</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>Loaded after {delay}ms</p>
    </div>
  );
}

function Skeleton({label}) {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '60%', marginTop: 8}} />
    </div>
  );
}

function NestedSuspense() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Nested Suspense xxx</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Boundaries resolve in order: 500ms, 1000ms, 2000ms, 3000ms
        </p>
      </div>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Fast (500ms)" delay={500} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Medium (1000ms)" delay={1000} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Slow (2000ms)" delay={2000} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Slowest (3000ms)" delay={3000} />
      </Suspense>
    </div>
  );
}

module.exports = NestedSuspense;
module.exports.default = NestedSuspense;
module.exports.fixture = fixture;
