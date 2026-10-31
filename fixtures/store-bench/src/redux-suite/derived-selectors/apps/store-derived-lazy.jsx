// SPIKE (docs/use-store/research/shared-derived-data.md), option 6: the
// category stats as a derived store, approximated in userland. Unlike
// store-derived.jsx, nothing is computed in the update: the stats for every
// category are computed lazily, by the first CategoryStats that renders after
// posts or comments change, from the snapshots that render read. Everything
// else is the same as store.jsx.
//
// Port of the derived-selectors scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {use, unstable_createStore as createStore} from 'react';
import {startBench} from '../harness';
import {countRender} from '../../common/instrument';
import {getCommentCount, getPostsByUser, getCategoryStats} from '../derive';
import {weakMemo} from '../shared-memo';
import {
  TIER1_COUNT,
  TIER2_COUNT,
  TIER4_COUNT,
  CATEGORIES,
  userIds,
} from '../constants';

let s = null;

// A stand-in for a derived store: createStore(sources, derive) would return a
// store whose value is derive(...values of the sources), computed lazily the
// first time a render reads it and cached by the identity of the source
// values. Here it's the sources and a weakMemo'd derive function.
function createDerivedStore(sources, derive) {
  return {sources, derive: weakMemo(derive)};
}

// What use(derivedStore) would do: read every source at this render's cut,
// then derive once per set of source snapshots.
function useDerived(derived) {
  const values = [];
  for (let i = 0; i < derived.sources.length; i++) {
    values.push(use(derived.sources[i]));
  }
  return derived.derive.apply(null, values);
}

function getAllCategoryStats(posts, comments) {
  const stats = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    stats[CATEGORIES[i]] = getCategoryStats(posts, comments, CATEGORIES[i]);
  }
  return stats;
}

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
  const stats = useDerived(s.categoryStats)[category];
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

function createApp({users, posts, comments}) {
  // Post and user IDs are their indexes.
  s = {
    users: createStore(users),
    posts: createStore(posts),
    comments: createStore(comments),
  };
  s.categoryStats = createDerivedStore(
    [s.posts, s.comments],
    getAllCategoryStats
  );
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

startBench('store-derived-lazy', createApp);
