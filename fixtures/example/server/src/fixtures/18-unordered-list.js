const React = require('react');

const fixture = {
  title: 'Unordered List',
  description: 'Basic unordered list with bullet items',
  category: 'Lists & Tables',
};

function UnorderedList() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Unordered List</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Basic ul with li items
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <ul>
          <li>React Server Components</li>
          <li>Yoga Layout Engine</li>
          <li>UIKit Native Views</li>
        </ul>
      </div>
    </div>
  );
}

module.exports = UnorderedList;
module.exports.default = UnorderedList;
module.exports.fixture = fixture;
