import * as React from 'react'
import { readFile } from 'fs/promises';
import Markdown from 'react-markdown';
import {ThemeButton} from './Theme.js';

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










import imageToGradient from 'image-to-gradient';

async function Image(props) {
  const gradient = await getGradient('./public' + props.src);
  return (
    <ThemeButton theme={gradient}>
      <img {...props} />
    </ThemeButton>
  );
}

async function getGradient(src) {
  return new Promise((resolve, reject) => {
    imageToGradient(src, {
      angle: 10, // gradient angle in degrees
      steps: 64  // number of steps
    }, function(err, cssGradient) {
      if (err) {
        reject(err);
      } else {
        resolve(cssGradient);
      }
    });
  })  
}


