'use client';

const React = require('react');
const {useState, useEffect} = React;

function ScriptLoader({serverOrigin}) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    var script = document.createElement('script');
    script.src = serverOrigin + '/test-script.js';
    script.onload = function () {
      if (globalThis.__TEST_SCRIPT_EXECUTED__) {
        setStatus('executed');
      } else {
        setStatus('loaded but not executed');
      }
    };
    script.onerror = function () {
      setStatus('error');
    };
    document.head.appendChild(script);
  }, [serverOrigin]);

  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Script Status</h3>
      <p id="script-status" style={{color: status === 'executed' ? '#34c759' : '#ff3b30', marginTop: 0}}>
        {status}
      </p>
    </div>
  );
}

module.exports = ScriptLoader;
module.exports.default = ScriptLoader;
