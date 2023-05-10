import * as React from 'react'
import PostIndexPage from './PostIndexPage.js';
import PostPage from './PostPage.js';
import Layout from './Layout.js';

export default function Router({ searchParams, pathname }) {
  let page;
  if (pathname === '/') {
    page = <PostIndexPage searchParams={searchParams} />
  } else if (pathname.startsWith('/post/')) {
    const slug = pathname.slice('/post/'.length)
    page = <PostPage slug={slug} />
  }
  return (
    <Layout>
      {page}
    </Layout>
  )
}
