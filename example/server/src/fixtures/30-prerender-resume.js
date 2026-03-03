const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Prerender + Resume',
  description: 'Static shell served from cache, dynamic content filled per-request via resume',
  category: 'Advanced',
  config: {
    ssrEndpoint: 'prerender',
  },
};

// ---------- Static content (included in the prerendered shell) ----------

function StaticHeader() {
  return (
    <div style={{paddingTop: 48, paddingBottom: 8}}>
      <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Prerender + Resume</h1>
      <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
        Static shell served instantly from cache. Dynamic content fills in via
        resume.
      </p>
    </div>
  );
}

function StaticFooter() {
  return (
    <div style={{padding: 16, backgroundColor: '#e5e5ea', borderRadius: 12, marginTop: 8}}>
      <p
        style={{
          color: '#8e8e93',
          fontSize: 13,
          marginTop: 0,
          marginBottom: 0,
          textAlign: 'center',
        }}>
        Shell prerendered and cached on device.
      </p>
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
          width: 140,
        }}
      />
      <div
        style={{
          backgroundColor: '#e5e5ea',
          borderRadius: 7,
          height: 14,
          width: '80%',
        }}
      />
    </div>
  );
}

function TimestampSkeleton() {
  return (
    <div>
      <div
        style={{
          backgroundColor: '#e5e5ea',
          borderRadius: 7,
          height: 14,
          width: '60%',
        }}
      />
    </div>
  );
}

// ---------- Async server components (pending during prerender) ----------

async function DynamicGreeting() {
  await new Promise(resolve => setTimeout(resolve, 1500));
  return (
    <div id="greeting">
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>
        Welcome!
      </h3>
      <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>
        This greeting was generated fresh at{' '}
        {new Date().toLocaleTimeString()}.
      </p>
    </div>
  );
}

async function DynamicTimestamp() {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return (
    <div id="timestamp">
      <p style={{color: '#8e8e93', fontSize: 13, marginTop: 0, marginBottom: 0}}>
        Request processed at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}

// ---------- Root ----------

function PrerenderResumeApp() {
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
      <StaticHeader />
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <Suspense fallback={<GreetingSkeleton />}>
          <DynamicGreeting />
        </Suspense>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <Suspense fallback={<TimestampSkeleton />}>
          <DynamicTimestamp />
        </Suspense>
      </div>
      <StaticFooter />
    </div>
  );
}

module.exports = PrerenderResumeApp;
module.exports.default = PrerenderResumeApp;
module.exports.fixture = fixture;
