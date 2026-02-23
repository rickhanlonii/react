'use client';

const React = require('react');
const {useState} = React;

function FormControls() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div style={{padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8}}>
        <p style={{color: '#2e7d32', fontWeight: 'bold', marginTop: 0, marginBottom: 4}}>
          Submitted!
        </p>
        <p style={{color: '#2e7d32', fontSize: 13, marginTop: 0}}>
          Name: {name || '(empty)'}, Bio: {bio || '(empty)'}
        </p>
        <button onClick={() => setSubmitted(false)}>Reset</button>
      </div>
    );
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      <div>
        <label style={{color: '#8e8e93', fontSize: 13}}>Name</label>
        <input
          value={name}
          placeholder="Enter your name"
          onChange={(e) => setName(e?.target?.value ?? e?.value ?? '')}
        />
      </div>
      <div>
        <label style={{color: '#8e8e93', fontSize: 13}}>Bio</label>
        <textarea
          value={bio}
          placeholder="Tell us about yourself"
          onChange={(e) => setBio(e?.target?.value ?? e?.value ?? '')}
        />
      </div>
      <button onClick={() => setSubmitted(true)}>Submit</button>
    </div>
  );
}

module.exports = FormControls;
module.exports.default = FormControls;
