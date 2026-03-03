const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Server Only',
  description: 'SSR-rendered content without hydration — static output, no client JS',
  category: 'Advanced',
  config: {
    ssrEndpoint: 'server-only',
  },
};

// ---------- Async server components ----------

async function SlowGreeting() {
  await new Promise(resolve => setTimeout(resolve, 1500));
  return (
    <div>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>
        Hello from the server!
      </h3>
      <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>
        This greeting was rendered at {new Date().toLocaleTimeString()}.
        No client JS was loaded — this is purely server-rendered.
      </p>
    </div>
  );
}

async function SlowStats() {
  await new Promise(resolve => setTimeout(resolve, 2500));
  const stats = [
    {label: 'Server Components', value: '3'},
    {label: 'Client Components', value: '0'},
    {label: 'JS Bundle Size', value: '0 KB'},
  ];
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      {stats.map((stat, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <span style={{color: '#8e8e93', fontSize: 15}}>{stat.label}</span>
          <span
            style={{
              color: '#1c1c1e',
              fontSize: 15,
              fontWeight: 'bold',
            }}>
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Skeletons ----------

function GreetingSkeleton() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      <div
        style={{
          backgroundColor: '#e5e5ea',
          borderRadius: 7,
          height: 20,
          width: 160,
        }}
      />
      <div
        style={{
          backgroundColor: '#e5e5ea',
          borderRadius: 7,
          height: 14,
          width: '90%',
        }}
      />
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}>
          <div
            style={{
              backgroundColor: '#e5e5ea',
              borderRadius: 7,
              height: 14,
              width: 120,
            }}
          />
          <div
            style={{
              backgroundColor: '#e5e5ea',
              borderRadius: 7,
              height: 14,
              width: 40,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------- Root ----------

function ServerOnlyApp() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f2f2f7',
        minHeight: '100%',
        padding: 16,
        gap: 16,
      }}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>
          Server Only
        </h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Pure server rendering — no hydration, no client JS
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <Suspense fallback={<GreetingSkeleton />}>
          <SlowGreeting />
        </Suspense>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <Suspense fallback={<StatsSkeleton />}>
          <SlowStats />
        </Suspense>
      </div>
      <div
        style={{
          padding: 16,
          backgroundColor: '#e5e5ea',
          borderRadius: 12,
          marginTop: 8,
        }}>
        <p
          style={{
            color: '#8e8e93',
            fontSize: 13,
            marginTop: 0,
            marginBottom: 0,
            textAlign: 'center',
          }}>
          No JS bundle loaded. Suspense boundaries resolve server-side.
        </p>
      </div>
    </div>
  );
}

module.exports = ServerOnlyApp;
module.exports.default = ServerOnlyApp;
module.exports.fixture = fixture;
