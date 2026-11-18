// SPIKE (docs/use-store/research/shared-derived-data.md), option 4: store.jsx
// with the category stats in a stand-in for a React client cache whose
// entries live for two generations, the current render and the last committed
// one. Entries are held strongly (Maps, not WeakMaps), so memory is bounded by
// what two renders computed, whatever the arguments are.
//
// React would start a generation when a root commits. Here CacheGeneration
// re-renders whenever the cached function's inputs change and starts one in a
// layout effect, which adds one render per update. Everything else is the
// same as store.jsx.
//
// Port of the derived-selectors scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {use, useLayoutEffect, unstable_createStore as createStore} from 'react';
import {startBench} from '../harness';
import {countRender} from '../../common/instrument';
import {getCommentCount, getPostsByUser, getCategoryStats} from '../derive';
import {generationalMemo, nextGeneration} from '../shared-memo';
import {
  TIER1_COUNT,
  TIER2_COUNT,
  TIER4_COUNT,
  CATEGORIES,
  userIds,
} from '../constants';

let s = null;

const getSharedCategoryStats = generationalMemo(getCategoryStats);

// Tier 1: direct entity lookup
function PostCard({postId}) {
  countRender();
  const post = use(s.posts)[postId];
  if (!post) return null;
  return (
    <div>
      {post.title}: {post.score}
    </div>
  );
}

// Tier 2: post + derived comment count
function PostWithComments({postId}) {
  countRender();
  const post = use(s.posts)[postId];
  if (!post) return null;
  const commentCount = getCommentCount(use(s.comments), postId);
  return (
    <div>
      {post.title} ({commentCount} comments)
    </div>
  );
}

// Tier 3: filtered + sorted posts per user
function UserPostList({userId}) {
  countRender();
  const posts = getPostsByUser(use(s.posts), userId);
  return (
    <div>
      {posts.length} posts, top: {posts[0]?.title}
    </div>
  );
}

// Tier 4: aggregated category statistics
function CategoryStats({category}) {
  countRender();
  const posts = use(s.posts);
  const comments = use(s.comments);
  const stats = getSharedCategoryStats(posts, comments, category);
  return (
    <div>
      {category}: {stats.postCount} posts, avg {stats.avgScore.toFixed(1)}
    </div>
  );
}

// Starts a new cache generation after every commit that changed the inputs.
function CacheGeneration() {
  countRender();
  use(s.posts);
  use(s.comments);
  useLayoutEffect(() => {
    nextGeneration();
  });
  return null;
}

function App() {
  return (
    <div>
      <div>
        {Array.from({length: TIER1_COUNT}, (_, i) => (
          <PostCard key={`t1-${i}`} postId={i} />
        ))}
      </div>
      <div>
        {Array.from({length: TIER2_COUNT}, (_, i) => (
          <PostWithComments key={`t2-${i}`} postId={i} />
        ))}
      </div>
      <div>
        {userIds.map(uid => (
          <UserPostList key={`t3-${uid}`} userId={uid} />
        ))}
      </div>
      <div>
        {CATEGORIES.map(cat =>
          Array.from({length: TIER4_COUNT / CATEGORIES.length}, (_, i) => (
            <CategoryStats key={`t4-${cat}-${i}`} category={cat} />
          ))
        )}
      </div>
      <CacheGeneration />
    </div>
  );
}

function createApp({users, posts, comments}) {
  // Post and user IDs are their indexes.
  s = {
    users: createStore(users),
    posts: createStore(posts),
    comments: createStore(comments),
  };
  let commentId = comments.length;
  const actions = {
    updateScore(id, score) {
      s.posts.update(prev => {
        const next = prev.slice();
        next[id] = {...prev[id], score};
        return next;
      });
    },
    addComment(postId, userId) {
      const comment = {
        id: commentId,
        postId,
        userId,
        text: `Comment ${commentId}`,
      };
      commentId++;
      s.comments.update(prev => [...prev, comment]);
    },
    updateRole(id, role) {
      s.users.update(prev => {
        const next = prev.slice();
        next[id] = {...prev[id], role};
        return next;
      });
    },
  };
  return {App, actions};
}

startBench('store-cache-gen', createApp);
