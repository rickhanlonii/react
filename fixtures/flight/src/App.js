import * as React from 'react'
import AllPostsPage from './AllPostsPage.js';
import PostPage from './PostPage.js';

export default function App({ searchParams, pathname }) {
  let page;
  if (pathname === '/') {
    page = <AllPostsPage searchParams={searchParams} />
  } else if (pathname.startsWith('/post/')) {
    const slug = pathname.slice('/post/'.length)
    page = <PostPage slug={slug} />
  }
  return (
    <html>
      <body>
        {page}
      </body>
    </html>
  )
}



