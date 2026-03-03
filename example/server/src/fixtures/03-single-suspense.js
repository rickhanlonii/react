const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Async Content',
  description: 'Card with content that loads after a short delay',
  category: 'Loading Patterns',
};

async function SlowContent({delay}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return (
    <div>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Loaded Content</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>
        This content was loaded after a {delay}ms delay on the server.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '80%'}} />
    </div>
  );
}

function SingleSuspense() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Async Content</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          A card that loads its content after a short delay
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <Suspense fallback={<Skeleton />}>
          <SlowContent delay={1500} />
        </Suspense>
      </div>
    </div>
  );
}

module.exports = SingleSuspense;
module.exports.default = SingleSuspense;
module.exports.fixture = fixture;
