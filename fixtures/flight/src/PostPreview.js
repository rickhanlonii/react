import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown'

export default async function PostPreview({ file }) {
  const content = await readFile('./posts/' + file, 'utf8');
  return (
    <div>
      <a href={'/post/' + file.split('.')[0]}>
        {file}
      </a>
      <Markdown>
        {content}
      </Markdown>
    </div>
  );
}