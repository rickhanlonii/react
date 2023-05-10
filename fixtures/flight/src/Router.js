import PostIndexPage from './PostIndexPage.js';
import PostPage from './PostPage.js';
import Layout from './Layout.js';

function Router({ searchParams, path }) {
  let page;
  if (path === '/') {
    page = <PostIndexPage searchParams={searchParams} />
  } else if (path.startsWith('/post/')) {
    const slug = path.slice('/post/'.length)
    page = <PostPage slug={slug} />
  }
  return (
    <Layout>
      {page}
    </Layout>
  );
}


























import ScrollManager from './ScrollManager.js';
import { readFile } from 'fs/promises';
import path from 'path';

Router = async function Router({ searchParams, path }) {
  const demoConfig = JSON.parse(
    await readFile(
      `./src/demo.json`,
      'utf8'
    )
  );

  let page;
  if (path === '/') {
    page = <PostIndexPage searchParams={searchParams} />
  } else if (path.startsWith('/post/')) {
    const slug = path.slice('/post/'.length)
    page = <PostPage slug={slug} />
  }

  if (demoConfig.demo === 'real-react') {
    return (
      <Layout>
        <ScrollManager path={path}>
          {page}
        </ScrollManager>
      </Layout>
    );
  } else {
    return (
      <Layout>
        {page}
      </Layout>
    );
  }
}

export default Router;