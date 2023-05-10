import * as React from 'react'
import { Suspense } from 'react';
import { readFile } from 'fs/promises';
import Post from './Post.js';
import { addComment } from './actions.js';
import { db } from './database.js'

export default async function PostPage({ slug }) {
  return (
    <div>
      <a href="/">home</a>
      <Post slug={slug} />
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
  const comments = await db.findCommentsForPost(slug);
  let header = 'No comments yet';
  if (comments.length === 1) {
    header = '1 comment';
  } else if (comments.length > 1) {
    header = `${comments.length} comments`
  }
  return (
    <section>
      <h3>{header}</h3>
      {comments.map(({ text, color }) => 
        <marquee style={{ color }}>
          <p>{text}</p>
        </marquee>
      )}
    </section>
  );
}
