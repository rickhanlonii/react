# Streaming Deferred Suspense Content After Shell

## Category
fizz

## Description
Validates the core Fizz streaming mechanism: the shell (synchronous content + Suspense fallbacks) is sent first, then deferred content inside Suspense boundaries is streamed incrementally as it resolves. Each resolved boundary is delivered as an HTML chunk inside a hidden `<template>` element, accompanied by a `<script>` that swaps the fallback content with the real content. This is the fundamental progressive loading pattern of Fizz.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (streaming deferred content)
- `packages/react-dom/src/__tests__/ReactDOMFizzServerNode-test.js` (deferred streaming in Node)

## App Setup
```jsx
let resolveProfile, resolvePosts, resolveComments;
const profilePromise = new Promise(r => { resolveProfile = r; });
const postsPromise = new Promise(r => { resolvePosts = r; });
const commentsPromise = new Promise(r => { resolveComments = r; });

function Profile() {
  const data = React.use(profilePromise);
  return (
    <div id="profile">
      <h2>{data.name}</h2>
      <p>{data.bio}</p>
    </div>
  );
}

function Posts() {
  const posts = React.use(postsPromise);
  return (
    <ul id="posts">
      {posts.map(post => <li key={post.id}>{post.title}</li>)}
    </ul>
  );
}

function Comments() {
  const comments = React.use(commentsPromise);
  return (
    <ul id="comments">
      {comments.map(c => <li key={c.id}>{c.text}</li>)}
    </ul>
  );
}

function StreamingDeferredApp() {
  return (
    <div id="app">
      <header>
        <h1>User Page</h1>
        <nav>Home | Profile | Settings</nav>
      </header>

      <Suspense fallback={<div id="profile-skeleton">Loading profile...</div>}>
        <Profile />
      </Suspense>

      <Suspense fallback={<div id="posts-skeleton">Loading posts...</div>}>
        <Posts />
      </Suspense>

      <Suspense fallback={<div id="comments-skeleton">Loading comments...</div>}>
        <Comments />
      </Suspense>

      <footer>
        <p>Copyright 2024</p>
      </footer>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<StreamingDeferredApp />, { onShellReady() { pipe(writable); } })`.

## Load Sequence
1. Server renders the shell: header, three Suspense fallbacks, and footer.
2. `onShellReady` fires and the shell is piped.
3. The user sees the page layout immediately with skeleton placeholders.
4. Profile data resolves first -- a streaming chunk arrives with profile content.
5. The Fizz runtime script in that chunk swaps the profile skeleton with real content.
6. Posts data resolves next -- another streaming chunk arrives.
7. Comments data resolves last -- final streaming chunk arrives.
8. Each chunk is self-contained: it includes the HTML in a `<template>` and a `<script>` to perform the swap.

## Actions
1. Start rendering and pipe on `onShellReady`.
2. Capture the shell HTML and verify it contains all three fallbacks.
3. Resolve profile data: `resolveProfile({ name: 'Alice', bio: 'Developer' })`.
4. Capture the streaming chunk for profile.
5. Verify the DOM now shows profile content, but posts and comments are still skeletons.
6. Resolve posts: `resolvePosts([{ id: 1, title: 'First Post' }, { id: 2, title: 'Second Post' }])`.
7. Capture the streaming chunk for posts.
8. Resolve comments: `resolveComments([{ id: 1, text: 'Great!' }, { id: 2, text: 'Thanks' }])`.
9. Capture the final streaming chunk.
10. Verify the complete DOM.

## Assertions
1. The shell contains the header with `<h1>User Page</h1>` and navigation.
2. The shell contains all three skeleton fallbacks with their respective IDs.
3. The shell contains the footer.
4. After profile resolves, the profile streaming chunk contains the real `<div id="profile">` with name and bio inside a hidden `<template>` element and a `<script>` to perform the swap.
5. After applying the profile chunk, `#profile-skeleton` is no longer visible, replaced by `#profile`.
6. Posts and comments skeletons remain visible after only the profile resolves.
7. After posts resolve, `#posts` contains two `<li>` elements with post titles.
8. After comments resolve, `#comments` contains two `<li>` elements with comment text.
9. The final DOM contains no skeleton/fallback content.
10. Each streaming chunk is a well-formed HTML fragment (no unclosed tags).
11. The streaming scripts reference the correct Suspense boundary IDs.
