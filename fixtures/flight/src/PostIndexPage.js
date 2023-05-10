import * as React from 'react'
import { readdir } from 'fs/promises';
import Post from './Post.js'
import { filterFiles } from './utils.js';

export default async function PostIndexPage({ searchParams }) {
  let files = await readdir('./posts/');
  if (searchParams.query) {
    files = filterFiles(files, searchParams.query);
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
        <PostPreview
          key={file}
          slug={file.split('.')[0]} />
      )}
    </div>
  );
}

function PostPreview({ slug }) {
  return (
    <div>
      <Post isExcerpt={true} slug={slug} />
      <a href={'/post/' + slug}>
        read more...
      </a>
      <hr />
    </div>
  );
}
