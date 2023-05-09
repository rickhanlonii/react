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
      <Markdown components={{img: Image}}>
        {text}
      </Markdown>
    </div>
  );
}

function Image({ src, alt }) {
  return <img style={{ border: '1px solid red'}} src={src} alt={alt} />
}