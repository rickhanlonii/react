import * as React from 'react'
import PostIndexPage from './PostIndexPage.js';
import PostPage from './PostPage.js';

export default function App({ searchParams, pathname }) {
  let page;
  if (pathname === '/') {
    page = <PostIndexPage searchParams={searchParams} />
  } else if (pathname.startsWith('/post/')) {
    const slug = pathname.slice('/post/'.length)
    page = <PostPage slug={slug} />
  }
  return (
    <html>
      <body>
        <link rel="stylesheet" href="/main.css" />
        <div className="container">
          <div className="background" />
          {page}
        </div>
      </body>
    </html>
  )
}



