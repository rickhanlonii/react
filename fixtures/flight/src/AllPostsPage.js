import * as React from 'react'
import { readdir } from 'fs/promises';
import PostPreview from './PostPreview.js'

export default async function AllPostsPage({ searchParams }) {
  let files = await readdir('./posts/');
  if (searchParams.query) {
    files = files.filter(f => f.split('-').some(word => word.startsWith(searchParams.query)))
  }
  return (
    <div>
      <form>
        <label>
          search the treasure box:
          <input name="query" defaultValue={searchParams.query} />
          <p>{searchParams.query ? 'found ' + files.length + ' bangers' : ''}</p>
        </label>
      </form>
      <hr />
      {files.map(file =>
        <div key={file}>
          <PostPreview file={file} />
          <hr />
        </div>
      )}
    </div>
  );
}
