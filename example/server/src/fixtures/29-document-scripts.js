const React = require('react');
const ScriptLoader = require('../components/ScriptLoader');

const fixture = {
  title: 'Document Scripts',
  description: 'Tests document.head.appendChild for script loading via useEffect',
  category: 'Infrastructure',
};

function DocumentScripts() {
  var port = process.env.PORT || 6000;
  var serverOrigin = 'http://localhost:' + port;

  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Document Scripts</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Inserts a script into document.head via useEffect
        </p>
      </div>
      <ScriptLoader serverOrigin={serverOrigin} />
    </div>
  );
}

module.exports = DocumentScripts;
module.exports.default = DocumentScripts;
module.exports.fixture = fixture;
