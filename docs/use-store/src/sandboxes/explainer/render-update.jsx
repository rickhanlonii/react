import {use, useState, unstable_createStore as createStore} from 'react';

const lastSearch = createStore('');

function Results({query}) {
  // Don't do this: it updates a shared store during render.
  if (use(lastSearch) !== query) {
    lastSearch.update(query);
  }
  return <p className="results">Results for "{query}"</p>;
}

function LastSearch() {
  return <p className="last">Last search: {use(lastSearch)}</p>;
}

export default function App() {
  const [query, setQuery] = useState('react');
  return (
    <>
      <button onClick={() => setQuery('stores')}>Search for stores</button>
      <Results query={query} />
      <LastSearch />
    </>
  );
}
