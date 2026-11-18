// Redux: the derived-selectors scenario from reduxjs/react-redux-benchmarks
// (src/scenarios/derived-selectors), maintained by the Redux team.
// Copyright (c) 2018 Redux, MIT License.
//
// state.ts, selectors.ts, components.tsx and App.tsx are kept as written,
// converted from TS to JSX. Changes:
// - The seed data comes from a seeded generator (createSeedData) instead of
//   Math.random(), so every variant renders the same thing.
// - The store is created per mount (createApp) instead of at module load, and
//   the dispatch timing middleware and <Profiler> are dropped: the harness
//   times each update in flushSync instead.
// - counted() and derivation() wrap the selectors and the createSelector
//   result functions. They return the function unchanged outside the counting
//   build.

import React from 'react';
import {
  combineReducers,
  configureStore,
  createEntityAdapter,
  createSelector,
  createSlice,
} from '@reduxjs/toolkit';
import {Provider, useSelector} from 'react-redux';
import {startBench} from '../harness';
import {createSeedData} from '../data';
import {countRender, counted, derivation} from '../../common/instrument';
import {
  TIER1_COUNT,
  TIER2_COUNT,
  TIER4_COUNT,
  CATEGORIES,
  userIds,
} from '../constants';

// ---------------------------------------------------------------- state.ts

// --- Adapters ---

const usersAdapter = createEntityAdapter();
const postsAdapter = createEntityAdapter();
const commentsAdapter = createEntityAdapter();

// --- Seed data ---

const {
  users: seedUsers,
  posts: seedPosts,
  comments: seedComments,
} = createSeedData();

// --- Slices ---

const usersSlice = createSlice({
  name: 'users',
  initialState: usersAdapter.getInitialState(undefined, seedUsers),
  reducers: {
    updateRole(state, action) {
      usersAdapter.updateOne(state, {
        id: action.payload.id,
        changes: {role: action.payload.role},
      });
    },
  },
});

const postsSlice = createSlice({
  name: 'posts',
  initialState: postsAdapter.getInitialState(undefined, seedPosts),
  reducers: {
    updateScore: postsAdapter.updateOne,
  },
});

const commentsSlice = createSlice({
  name: 'comments',
  initialState: commentsAdapter.getInitialState(undefined, seedComments),
  reducers: {
    addComment: commentsAdapter.addOne,
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    selectedCategory: 'tech',
    sortBy: 'score',
  },
  reducers: {},
});

// --- Root reducer ---

const rootReducer = combineReducers({
  users: usersSlice.reducer,
  posts: postsSlice.reducer,
  comments: commentsSlice.reducer,
  ui: uiSlice.reducer,
});

// --- Adapter selectors ---

const {selectById: selectPostById, selectAll: selectAllPosts} =
  postsAdapter.getSelectors(state => state.posts);

const {selectAll: selectAllComments} = commentsAdapter.getSelectors(
  state => state.comments
);

// --- Exported actions ---

const {updateScore} = postsSlice.actions;
const {addComment} = commentsSlice.actions;
const {updateRole} = usersSlice.actions;

// ---------------------------------------------------------------- selectors.ts

// Tier 2: post + comment count
const selectPostWithComments = createSelector(
  [(state, postId) => selectPostById(state, postId), selectAllComments],
  derivation((post, comments) =>
    post
      ? {
          ...post,
          commentCount: comments.filter(c => c.postId === post.id).length,
        }
      : null
  )
);

// Tier 3: all posts for a user, sorted by score desc
const selectPostsByUser = createSelector(
  [selectAllPosts, (_, userId) => userId],
  derivation((posts, userId) =>
    posts.filter(p => p.userId === userId).sort((a, b) => b.score - a.score)
  )
);

// Tier 4: aggregate stats for a category
const selectCategoryStats = createSelector(
  [selectAllPosts, selectAllComments, (_, category) => category],
  derivation((posts, comments, category) => {
    const catPosts = posts.filter(p => p.category === category);
    const postIds = new Set(catPosts.map(p => p.id));
    const commentCount = comments.filter(c => postIds.has(c.postId)).length;
    const avgScore =
      catPosts.length > 0
        ? catPosts.reduce((sum, p) => sum + p.score, 0) / catPosts.length
        : 0;
    return {
      postCount: catPosts.length,
      avgScore,
      commentCount,
    };
  })
);

// ---------------------------------------------------------------- components.tsx

// Tier 1: direct entity lookup
const PostCard = React.memo(function PostCard({postId}) {
  countRender();
  const post = useSelector(counted(state => selectPostById(state, postId)));
  if (!post) return null;
  return (
    <div>
      {post.title}: {post.score}
    </div>
  );
});

// Tier 2: post + derived comment count
const PostWithComments = React.memo(function PostWithComments({postId}) {
  countRender();
  const data = useSelector(
    counted(state => selectPostWithComments(state, postId))
  );
  if (!data) return null;
  return (
    <div>
      {data.title} ({data.commentCount} comments)
    </div>
  );
});

// Tier 3: filtered + sorted posts per user
const UserPostList = React.memo(function UserPostList({userId}) {
  countRender();
  const posts = useSelector(counted(state => selectPostsByUser(state, userId)));
  return (
    <div>
      {posts.length} posts, top: {posts[0]?.title}
    </div>
  );
});

// Tier 4: aggregated category statistics
const CategoryStats = React.memo(function CategoryStats({category}) {
  countRender();
  const stats = useSelector(
    counted(state => selectCategoryStats(state, category))
  );
  return (
    <div>
      {category}: {stats.postCount} posts, avg {stats.avgScore.toFixed(1)}
    </div>
  );
});

// ---------------------------------------------------------------- App.tsx

let store = null;

function App() {
  return (
    <Provider store={store}>
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
    </Provider>
  );
}

// ---------------------------------------------------------------- index.tsx

function createApp() {
  store = configureStore({
    reducer: rootReducer,
    middleware: gdm =>
      gdm({
        immutabilityCheck: false,
        serializableCheck: false,
      }),
  });
  let commentId = seedComments.length;
  const actions = {
    updateScore(id, score) {
      store.dispatch(updateScore({id, changes: {score}}));
    },
    addComment(postId, userId) {
      store.dispatch(
        addComment({
          id: commentId,
          postId,
          userId,
          text: `Comment ${commentId}`,
        })
      );
      commentId++;
    },
    updateRole(id, role) {
      store.dispatch(updateRole({id, role}));
    },
  };
  return {App, actions};
}

startBench('redux', createApp);
