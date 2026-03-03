const React = require('react');

const fixture = {
  title: 'Static Cards',
  description: 'Two text cards with a heading and bulleted list',
  category: 'Basics',
};

function RscOnly() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Static Cards</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Simple text cards with a heading and bulleted list
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Welcome</h3>
        <p style={{color: '#1c1c1e', marginTop: 0}}>
          A simple page with static text content and a list.
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Static List</h3>
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>• Item one</p>
          <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>• Item two</p>
          <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>• Item three</p>
        </div>
      </div>
    </div>
  );
}

module.exports = RscOnly;
module.exports.default = RscOnly;
module.exports.fixture = fixture;
