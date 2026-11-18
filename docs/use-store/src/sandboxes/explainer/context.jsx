import {
  createContext,
  use,
  useState,
  unstable_createStore as createStore,
} from 'react';

// Context: one value, provided above the readers.
const Settings = createContext(null);

function CountProvider({children}) {
  const [count, setCount] = useState(0);
  return (
    <Settings value={{count, theme: 'dark'}}>
      <button className="context" onClick={() => setCount(c => c + 1)}>
        Context: add one
      </button>
      {children}
    </Settings>
  );
}
function ContextCount() {
  return <p className="context-count">Count: {use(Settings).count}</p>;
}
function ContextTheme() {
  return <p>Theme: {use(Settings).theme}</p>;
}

// Stores: one store per value, read directly.
const count = createStore(0);
const theme = createStore('dark');

function StoreCount() {
  return <p className="store-count">Count: {use(count)}</p>;
}
function StoreTheme() {
  return <p>Theme: {use(theme)}</p>;
}

export default function App() {
  return (
    <>
      <CountProvider>
        <ContextCount />
        <ContextTheme />
      </CountProvider>
      <button className="store" onClick={() => count.update(c => c + 1)}>
        Store: add one
      </button>
      <StoreCount />
      <StoreTheme />
    </>
  );
}
