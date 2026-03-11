const React = require('react');

const fixture = {
  title: 'Table',
  description: 'Basic table with thead, tbody, and styled cells',
  category: 'Lists & Tables',
};

function Table() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Table</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Table with header and body sections
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <table>
          <thead>
            <tr>
              <th style={{textAlign: 'left', padding: 8, borderBottomWidth: 1, borderBottomColor: '#c6c6c8'}}>Feature</th>
              <th style={{textAlign: 'left', padding: 8, borderBottomWidth: 1, borderBottomColor: '#c6c6c8'}}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{padding: 8}}>RSC Streaming</td>
              <td style={{padding: 8, color: '#34c759'}}>Done</td>
            </tr>
            <tr>
              <td style={{padding: 8}}>Client Hydration</td>
              <td style={{padding: 8, color: '#34c759'}}>Done</td>
            </tr>
            <tr>
              <td style={{padding: 8}}>Error Boundaries</td>
              <td style={{padding: 8, color: '#ff9500'}}>In Progress</td>
            </tr>
            <tr>
              <td style={{padding: 8}}>Suspense</td>
              <td style={{padding: 8, color: '#34c759'}}>Done</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

module.exports = Table;
module.exports.default = Table;
module.exports.fixture = fixture;
