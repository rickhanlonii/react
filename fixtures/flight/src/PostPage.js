import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'
import sharp from 'sharp'

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

async function Image({ src, alt, width, height }) {
  if (src.startsWith('/') && width == null && height == null) {
    const metadata = await sharp('./public' + src).metadata();
    width = metadata.width;
    height = metadata.height;
  }
  return <img style={{ border: '1px solid red'}} src={src} alt={alt} width={width} height={height} />
}