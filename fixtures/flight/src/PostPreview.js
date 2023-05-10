import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'

export default async function PostPreview({ slug }) {
  const markdown = await readFile('./posts/' + slug + '.md', 'utf8');
  const markdownExcerpt = (
    markdown.split('\n').slice(0, 12).join('\n') + '\n...'
  );
  return (
    <div>
      <Markdown>
        {markdownExcerpt.toLowerCase()}
      </Markdown>
      <a href={'/post/' + slug}>
        read more...
      </a>
    </div>
  );
}
