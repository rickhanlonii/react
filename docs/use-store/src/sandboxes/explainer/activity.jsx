import {
  use,
  useState,
  Activity,
  unstable_createStore as createStore,
} from 'react';

const status = createStore('online');

function Reader({name}) {
  const value = use(status);
  log(name + ' rendered ' + value);
  return (
    <p className={name}>
      {name}: {value}
    </p>
  );
}

export default function App() {
  const [mode, setMode] = useState('hidden');
  return (
    <>
      <button
        className="update"
        onClick={() =>
          status.update(s => (s === 'online' ? 'away' : 'online'))
        }>
        Toggle status
      </button>
      <button
        className="reveal"
        onClick={() => setMode(m => (m === 'hidden' ? 'visible' : 'hidden'))}>
        {mode === 'hidden' ? 'Reveal' : 'Hide'} the panel
      </button>
      <Reader name="Visible" />
      <Activity mode={mode}>
        <Reader name="Hidden" />
      </Activity>
    </>
  );
}
