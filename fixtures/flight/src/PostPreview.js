import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'

export default async function PostPreview({ file }) {
  const content = await readFile('./posts/' + file, 'utf8');
  return (
    <div>
      <Markdown>
        {content.toLowerCase().split('\n').slice(0, 12).join('\n') + '\n...'}
      </Markdown>
      <a href={'/post/' + file.split('.')[0]}>
        read more...
      </a>
    </div>
  );
}