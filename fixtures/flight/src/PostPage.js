import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'
import sharp from 'sharp'
import { comment } from './actions.js';
import { getServerState } from './ServerState.js'

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
      <hr />
      <ul>
        {(getServerState()[slug] || []).map(text => <li>{text}</li>)}
      </ul>
      <form action={comment}>
        <input type="hidden" name="slug" value={slug} />
        <input name="text" />
        <button>Post</button>
      </form>
    </div>
  );
}

async function Image({ src, alt, width, height }) {
  if (src.startsWith('/') && width == null && height == null) {
    const metadata = await sharp('./public' + src).metadata();
    width = metadata.width;
    height = metadata.height;
  }
  return <img style={{ border: '1px solid red'}} src={src} alt={alt} width={width} height={height} />
}