// WORKAROUND, not the idiomatic store variant: use(store) with the shared
// derived data (category stats) computed once per update, in the action, and
// kept in its own store. Everything else is the same as store.jsx. This
// checks whether computing shared derived data outside of render closes the
// gap with createSelector, which computes it once for every subscriber.
//
// There's no way to read a store outside of render, so the actions keep the
// latest posts and comments in `latest` to compute the stats from.
//
// Port of the derived-selectors scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {use, unstable_createStore as createStore} from 'react';
import {startBench} from '../harness';
import {countRender} from '../../common/instrument';
import {getCommentCount, getPostsByUser, getCategoryStats} from '../derive';
import {
  TIER1_COUNT,
  TIER2_COUNT,
  TIER4_COUNT,
  CATEGORIES,
  userIds,
} from '../constants';

let s = null;

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
  const stats = use(s.categoryStats)[category];
  return (
    <div>
      {category}: {stats.postCount} posts, avg {stats.avgScore.toFixed(1)}
    </div>
  );
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
    </div>
  );
}

function getAllCategoryStats(posts, comments) {
  const stats = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    stats[CATEGORIES[i]] = getCategoryStats(posts, comments, CATEGORIES[i]);
  }
  return stats;
}

function createApp({users, posts, comments}) {
  // Post and user IDs are their indexes.
  const latest = {posts, comments};
  s = {
    users: createStore(users),
    posts: createStore(posts),
    comments: createStore(comments),
    categoryStats: createStore(getAllCategoryStats(posts, comments)),
  };
  let commentId = comments.length;
  const actions = {
    updateScore(id, score) {
      const next = latest.posts.slice();
      next[id] = {...latest.posts[id], score};
      latest.posts = next;
      s.posts.update(next);
      s.categoryStats.update(getAllCategoryStats(next, latest.comments));
    },
    addComment(postId, userId) {
      const comment = {
        id: commentId,
        postId,
        userId,
        text: `Comment ${commentId}`,
      };
      commentId++;
      latest.comments = [...latest.comments, comment];
      s.comments.update(latest.comments);
      s.categoryStats.update(
        getAllCategoryStats(latest.posts, latest.comments)
      );
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

startBench('store-derived', createApp);
