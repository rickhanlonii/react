import * as React from 'react'
import { readFile } from 'fs/promises';

export default async function PostPreview({ file }) {
  const content = await readFile('./posts/' + file, 'utf8');
  return (
    <>
      <a href={'/post/' + file.split('.')[0]}>
        {file}
      </a>
      <pre>
        {content.slice(0, 10)}
      </pre>
    </>
  );
}