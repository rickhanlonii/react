// SPIKE (docs/use-store/research/shared-derived-data.md), option 5: what the
// React Compiler could emit for store.jsx if it shared memoized calls across
// component instances. This is store-compiled.jsx (the real compiler output)
// with one change: every call the compiler memoized that qualifies for
// sharing (a module-scope function called with frozen arguments whose result
// isn't mutated) goes through sharedCall(fn, ...args) when the per-instance
// check misses. The compiler can't tell which calls are expensive or shared,
// so getCommentCount and getPostsByUser, which no two components share here,
// go through it too. Look for SHARED below.
//
// The compiler skips files that already import from react/compiler-runtime,
// so the compiler and no-compiler builds of this file are the same.
//
// Port of the derived-selectors scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {c as _c} from 'react/compiler-runtime';
import {use, unstable_createStore as createStore} from 'react';
import {startBench} from '../harness';
import {countRender} from '../../common/instrument';
import {getCommentCount, getPostsByUser, getCategoryStats} from '../derive';
// SHARED: would be imported from react/compiler-runtime.
import {sharedCall as _sharedCall} from '../shared-memo';
import {
  TIER1_COUNT,
  TIER2_COUNT,
  TIER4_COUNT,
  CATEGORIES,
  userIds,
} from '../constants';
let s = null;

// Tier 1: direct entity lookup
function PostCard(t0) {
  const $ = _c(3);
  const {postId} = t0;
  countRender();
  const post = use(s.posts)[postId];
  if (!post) {
    return null;
  }
  let t1;
  if ($[0] !== post.score || $[1] !== post.title) {
    t1 = (
      <div>
        {post.title}: {post.score}
      </div>
    );
    $[0] = post.score;
    $[1] = post.title;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

// Tier 2: post + derived comment count
function PostWithComments(t0) {
  const $ = _c(6);
  const {postId} = t0;
  countRender();
  const post = use(s.posts)[postId];
  if (!post) {
    return null;
  }
  const t1 = use(s.comments);
  let t2;
  if ($[0] !== postId || $[1] !== t1) {
    // SHARED
    t2 = _sharedCall(getCommentCount, t1, postId);
    $[0] = postId;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const commentCount = t2;
  let t3;
  if ($[3] !== commentCount || $[4] !== post.title) {
    t3 = (
      <div>
        {post.title} ({commentCount} comments)
      </div>
    );
    $[3] = commentCount;
    $[4] = post.title;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}

// Tier 3: filtered + sorted posts per user
function UserPostList(t0) {
  const $ = _c(6);
  const {userId} = t0;
  countRender();
  const t1 = use(s.posts);
  let t2;
  if ($[0] !== t1 || $[1] !== userId) {
    // SHARED
    t2 = _sharedCall(getPostsByUser, t1, userId);
    $[0] = t1;
    $[1] = userId;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const posts = t2;
  const t3 = posts[0]?.title;
  let t4;
  if ($[3] !== posts.length || $[4] !== t3) {
    t4 = (
      <div>
        {posts.length} posts, top: {t3}
      </div>
    );
    $[3] = posts.length;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  return t4;
}

// Tier 4: aggregated category statistics
function CategoryStats(t0) {
  const $ = _c(14);
  const {category} = t0;
  countRender();
  const posts = use(s.posts);
  const comments = use(s.comments);
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  if ($[0] !== category || $[1] !== comments || $[2] !== posts) {
    // SHARED
    const stats = _sharedCall(getCategoryStats, posts, comments, category);
    t1 = category;
    t2 = ': ';
    t3 = stats.postCount;
    t4 = ' posts, avg ';
    t5 = stats.avgScore.toFixed(1);
    $[0] = category;
    $[1] = comments;
    $[2] = posts;
    $[3] = t1;
    $[4] = t2;
    $[5] = t3;
    $[6] = t4;
    $[7] = t5;
  } else {
    t1 = $[3];
    t2 = $[4];
    t3 = $[5];
    t4 = $[6];
    t5 = $[7];
  }
  let t6;
  if (
    $[8] !== t1 ||
    $[9] !== t2 ||
    $[10] !== t3 ||
    $[11] !== t4 ||
    $[12] !== t5
  ) {
    t6 = (
      <div>
        {t1}
        {t2}
        {t3}
        {t4}
        {t5}
      </div>
    );
    $[8] = t1;
    $[9] = t2;
    $[10] = t3;
    $[11] = t4;
    $[12] = t5;
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  return t6;
}
function App() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
    t0 = (
      <div>
        <div>
          {Array.from(
            {
              length: TIER1_COUNT,
            },
            _temp
          )}
        </div>
        <div>
          {Array.from(
            {
              length: TIER2_COUNT,
            },
            _temp2
          )}
        </div>
        <div>{userIds.map(_temp3)}</div>
        <div>{CATEGORIES.map(_temp4)}</div>
      </div>
    );
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
function _temp4(cat) {
  return Array.from(
    {
      length: TIER4_COUNT / CATEGORIES.length,
    },
    (__1, i_1) => <CategoryStats key={`t4-${cat}-${i_1}`} category={cat} />
  );
}
function _temp3(uid) {
  return <UserPostList key={`t3-${uid}`} userId={uid} />;
}
function _temp2(__0, i_0) {
  return <PostWithComments key={`t2-${i_0}`} postId={i_0} />;
}
function _temp(_, i) {
  return <PostCard key={`t1-${i}`} postId={i} />;
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
        next[id] = {
          ...prev[id],
          score,
        };
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
        next[id] = {
          ...prev[id],
          role,
        };
        return next;
      });
    },
  };
  return {
    App,
    actions,
  };
}
startBench('store-compiled-shared', createApp);
