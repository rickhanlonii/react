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
      <a href="/">home</a>
      <Markdown>
        {text.toLowerCase()}
      </Markdown>
      <hr />
      {(getServerState()[slug] || []).map(({text, color}) => 
        <marquee style={{color}}>
          <p>{text}</p>
        </marquee>
      )}
      <form action={comment}>
        <input type="hidden" name="slug" value={slug} />
        <input name="text" />
        <input type="submit" value="Post" />
      </form>
    </div>
  );
}
