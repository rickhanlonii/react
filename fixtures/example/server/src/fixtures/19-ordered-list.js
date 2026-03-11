const React = require('react');

const fixture = {
  title: 'Ordered List',
  description: 'Numbered list showing a sequence of steps',
  category: 'Lists & Tables',
};

function OrderedList() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Ordered List</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Numbered ol with li items
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <ol>
          <li>Server renders RSC</li>
          <li>Flight stream sent to client</li>
          <li>Client deserializes and hydrates</li>
          <li>Interactive components activate</li>
        </ol>
      </div>
    </div>
  );
}

module.exports = OrderedList;
module.exports.default = OrderedList;
module.exports.fixture = fixture;
