import {use, unstable_createStore as createStore} from 'react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';

const theme = createStore('light');

function App() {
  const value = use(theme);
  log('rendered ' + value);
  return <p>Theme: {value}</p>;
}

const container = document.getElementById('root');
container.innerHTML = renderToString(<App />);
log('server HTML: ' + container.innerHTML);

// The store changes before the client hydrates.
theme.update('dark');

hydrateRoot(container, <App />, {
  onRecoverableError: error => log('hydration error: ' + error.message),
});
