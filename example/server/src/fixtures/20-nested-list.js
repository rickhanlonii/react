const React = require('react');

const fixture = {
  title: 'Nested List',
  description: 'Lists nested inside list items with indentation',
  category: 'Lists & Tables',
};

function NestedList() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Nested List</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Lists inside list items
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <ul>
          <li>Server
            <ul>
              <li>RSC rendering</li>
              <li>Flight protocol</li>
            </ul>
          </li>
          <li>Client
            <ul>
              <li>JavaScriptCore</li>
              <li>Custom reconciler</li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  );
}

module.exports = NestedList;
module.exports.default = NestedList;
module.exports.fixture = fixture;
