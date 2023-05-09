import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'

export default async function PostPage({ slug }) {
  const text = await readFile('./posts/' + slug + '.md', 'utf8');
  return (
    <div>
      <h1>
        {slug}
      </h1>
      <Markdown>
        {text.slice(0, 10)}
      </Markdown>
    </div>
  );
}