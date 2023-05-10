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
        <object classID="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" codebase="http://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=6,0,40,0" width="550" height="400">
          <param name="movie" value="/video.swf" />
          <param name="quality" value="high" />
        </object>
      </body>
    </html>
  )
}



