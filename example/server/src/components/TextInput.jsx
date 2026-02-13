'use client';

const React = require('react');
const {useState, useTransition, Suspense} = React;

const ALL_ITEMS = [
  'Apple', 'Apricot', 'Avocado',
  'Banana', 'Blackberry', 'Blueberry',
  'Cherry', 'Coconut', 'Cranberry',
  'Date', 'Dragonfruit',
  'Elderberry',
  'Fig',
  'Grape', 'Grapefruit', 'Guava',
  'Kiwi',
  'Lemon', 'Lime', 'Lychee',
  'Mango', 'Melon',
  'Nectarine',
  'Orange',
  'Papaya', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Pomegranate',
  'Raspberry',
  'Strawberry',
  'Tangerine',
  'Watermelon',
];

const cache = {};

function search(query) {
  if (!query) {
    return ALL_ITEMS;
  }
  if (!cache[query]) {
    let result;
    const promise = new Promise((resolve) => {
      setTimeout(() => {
        const lower = query.toLowerCase();
        result = ALL_ITEMS.filter((item) => item.toLowerCase().includes(lower));
        resolve();
      }, 2000);
    }).then(() => {
      cache[query] = {status: 'resolved', value: result};
    });
    cache[query] = {status: 'pending', promise};
  }
  const entry = cache[query];
  if (entry.status === 'pending') {
    throw entry.promise;
  }
  return entry.value;
}

function SearchResults({query}) {
  const results = search(query);
  if (results.length === 0) {
    return <p style={{color: '#888'}}>No results found.</p>;
  }
  return (
    <div style={{gap: 4}}>
      {results.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function TextInput({placeholder = 'Search fruits...'}) {
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  return (
    <div style={{gap: 8}}>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          const value = e && e.value ? e.value : '';
          setQuery(value);
          startTransition(() => {
            setSearchQuery(value);
          });
        }}
      />
      <div style={{opacity: isPending ? 0.6 : 1}}>
        <Suspense fallback={<p style={{color: '#888'}}>Searching...</p>}>
          <SearchResults query={searchQuery} />
        </Suspense>
      </div>
    </div>
  );
}

module.exports = TextInput;
module.exports.default = TextInput;
