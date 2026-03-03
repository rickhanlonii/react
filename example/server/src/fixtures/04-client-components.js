const React = require('react');
const Counter = require('../components/Counter');
const Tabs = require('../components/Tabs');

const fixture = {
  title: 'Counter & Tabs',
  description: 'Interactive counter and tabbed content panels',
  category: 'Basics',
};

function ClientComponents() {
  console.error('test', {foo: 'bar'});
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Counter & Tabs</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Interactive counter and tabbed content panels
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Counter</h3>
        <Counter initialCount={0} />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Tabs</h3>
        <Tabs tabs={[
          {label: 'Tab 1', content: <p style={{color: '#1c1c1e', marginTop: 0}}>Content for tab one</p>},
          {label: 'Tab 2', content: <p style={{color: '#1c1c1e', marginTop: 0}}>Content for tab two</p>},
          {label: 'Tab 3', content: <p style={{color: '#1c1c1e', marginTop: 0}}>Content for tab three</p>},
        ]} />
      </div>
    </div>
  );
}

module.exports = ClientComponents;
module.exports.default = ClientComponents;
module.exports.fixture = fixture;
