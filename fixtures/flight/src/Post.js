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
    <Markdown components={{img: Image}}>
      {markdown.toLowerCase()}
    </Markdown>
  );
}
















import { extractGradient } from './utils.js';
import { updateTheme } from './actions.js';
import ImageButton from './ImageButton.js';

async function Image(props) {
  const gradient = await extractGradient('./public' + props.src);
  return (
    <ImageButton
      {...props}
      gradient={gradient}
      updateTheme={updateTheme}
    />
  );
}


