import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown';

export default async function Post({ slug, isExcerpt, children }) {
  let markdown = await readFile('./posts/' + slug + '.md', 'utf8');
  if (isExcerpt) {
    markdown = (
      markdown.split('\n').slice(0, 12).join('\n') + '\n...'
    );
  }
  return (
    <Markdown>
      {markdown.toLowerCase()}
    </Markdown>
  );
}
