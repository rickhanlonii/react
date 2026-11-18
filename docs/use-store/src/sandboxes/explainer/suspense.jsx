import {use, Suspense, unstable_createStore as createStore} from 'react';

const users = createResource();
users.resolve('grace', 'Grace Hopper');
// 'ada' never loads.
const userId = watchStore(createStore('ada'), 'userId');

function Profile() {
  const name = use(users.read(use(userId)));
  return <p className="profile">Hello, {name}</p>;
}

export default function App() {
  return (
    <>
      <button onClick={() => userId.update('grace')}>Show Grace instead</button>
      <Suspense fallback={<p className="profile">Loading…</p>}>
        <Profile />
      </Suspense>
    </>
  );
}
