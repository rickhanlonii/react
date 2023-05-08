import * as React from 'react'
import { readdir } from 'fs/promises';
import PostPreview from './PostPreview.js'

export default async function AllPostsPage({ searchParams }) {
  let files = await readdir('./posts/');
  if (searchParams.query != null) {
    files = files.filter(f => f.startsWith(searchParams.query))
  }
  return (
    <main>
      <h1>my blog</h1>
      <h2>{searchParams.query}</h2>
      <hr />
      <form>
        <input name="query" defaultValue={searchParams.query} />
      </form>
      <hr />
      {files.map(file =>
        <div key={file}>
          <PostPreview file={file} />
        </div>
      )}
    </main>
  );
}
