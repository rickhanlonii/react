const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Shared Content',
  description: 'Two cards rendering the same shared async content',
  category: 'Loading Patterns',
};

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function SharedData() {
  await sleep(500);
  return (
    <div style={{backgroundColor: '#e3f2fd', borderRadius: 8, padding: 12}}>
      <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0, fontSize: 14}}>
        Shared content (loaded once, used in multiple places)
      </p>
    </div>
  );
}

function Card({title, children}) {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 12}}>{title}</h3>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '80%', marginTop: 12}} />
    </div>
  );
}

function FlightDedupedComponent() {
  // SharedData is the same async component used in multiple cards.
  // React may deduplicate the rendering — the second reference
  // should show as a deduped entry in the performance trace.
  var sharedContent = <SharedData />;
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Shared Content</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Two cards rendering the same shared async content
        </p>
      </div>
      <Suspense fallback={<Skeleton />}>
        <Card title="Card A">
          {sharedContent}
        </Card>
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <Card title="Card B">
          {sharedContent}
        </Card>
      </Suspense>
    </div>
  );
}

module.exports = FlightDedupedComponent;
module.exports.default = FlightDedupedComponent;
module.exports.fixture = fixture;
