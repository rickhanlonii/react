import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'
import { addComment } from './actions.js';
import { db } from './database.js'

export default async function PostPage({ slug }) {
  const markdown = await readFile('./posts/' + slug + '.md', 'utf8');
  return (
    <div>
      <a href="/">home</a>
      <Markdown>
        {markdown.toLowerCase()}
      </Markdown>
      <hr />
      <PostComments slug={slug} />
      <form action={addComment}>
        <input type="hidden" name="slug" value={slug} />
        <input name="text" />
        <input type="submit" value="Post" />
      </form>
    </div>
  );
}

async function PostComments({ slug }) {
  const comments = await db.Comments.getByPost(slug);
  return comments.map(({ text, color }) => 
    <marquee style={{ color }}>
      <p>{text}</p>
    </marquee>
  );
}
