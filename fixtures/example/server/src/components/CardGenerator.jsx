'use client';

var React = require('react');
var {useActionState} = React;

function ShimmerCard() {
  return (
    <div style={{backgroundColor: '#f2f2f7', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12}}>
      <div style={{backgroundColor: '#e8e8ed', borderRadius: 6, width: '60%', height: 24}} />
      <div style={{backgroundColor: '#e8e8ed', borderRadius: 6, width: '100%', height: 16}} />
      <div style={{backgroundColor: '#e8e8ed', borderRadius: 6, width: '80%', height: 16}} />
      <div style={{backgroundColor: '#e8e8ed', borderRadius: 6, width: '100%', height: 60}} />
    </div>
  );
}

function CardGenerator({generateCard}) {
  var [state, dispatch, isPending] = useActionState(generateCard, {error: null});

  return (
    <form action={dispatch} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      <input
        id="card-prompt"
        name="prompt"
        type="text"
        placeholder="Describe a UI component..."
        style={{
          borderWidth: 1,
          borderColor: '#d1d1d6',
          borderRadius: 8,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: 15,
          color: '#1c1c1e',
          height: 44,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      <button
        id="generate-card"
        type="submit"
        style={{
          backgroundColor: isPending ? '#a0a0a0' : '#007aff',
          borderRadius: 8,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 16,
          paddingRight: 16,
        }}>
        <span style={{color: '#ffffff', fontSize: 15, fontWeight: '600'}}>
          {isPending ? 'Generating...' : 'Generate'}
        </span>
      </button>
      {state && state.error ? (
        <p style={{color: '#ff3b30', fontSize: 14, marginTop: 0, marginBottom: 0}}>
          {state.error}
        </p>
      ) : null}
      {isPending ? <ShimmerCard /> : null}
    </form>
  );
}

module.exports = CardGenerator;
module.exports.default = CardGenerator;
