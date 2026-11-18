// Zustand, written the way its docs recommend: one store, a selector per
// component, and useShallow for selectors that build a new object or array
// (as in the README's `useShallow((state) => Object.keys(state.treats))`).
// Every mounted selector, including its derivation, runs on every update.
//
// Port of the derived-selectors scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {create} from 'zustand';
import {useShallow} from 'zustand/react/shallow';
import {startBench} from '../harness';
import {countRender, counted} from '../../common/instrument';
import {getCommentCount, getPostsByUser, getCategoryStats} from '../derive';
import {
  TIER1_COUNT,
  TIER2_COUNT,
  TIER4_COUNT,
  CATEGORIES,
  userIds,
} from '../constants';

const useBench = create(() => ({}));

// Tier 1: direct entity lookup
function PostCard({postId}) {
  countRender();
  const post = useBench(counted(state => state.posts[postId]));
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
  const data = useBench(
    useShallow(
      counted(state => {
        const post = state.posts[postId];
        return post
          ? {...post, commentCount: getCommentCount(state.comments, postId)}
          : null;
      })
    )
  );
  if (!data) return null;
  return (
    <div>
      {data.title} ({data.commentCount} comments)
    </div>
  );
}

// Tier 3: filtered + sorted posts per user
function UserPostList({userId}) {
  countRender();
  const posts = useBench(
    useShallow(counted(state => getPostsByUser(state.posts, userId)))
  );
  return (
    <div>
      {posts.length} posts, top: {posts[0]?.title}
    </div>
  );
}

// Tier 4: aggregated category statistics
function CategoryStats({category}) {
  countRender();
  const stats = useBench(
    useShallow(
      counted(state => getCategoryStats(state.posts, state.comments, category))
    )
  );
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
  useBench.setState({users, posts, comments}, true);
  let commentId = comments.length;
  const actions = {
    updateScore(id, score) {
      useBench.setState(state => {
        const next = state.posts.slice();
        next[id] = {...state.posts[id], score};
        return {posts: next};
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
      useBench.setState(state => ({comments: [...state.comments, comment]}));
    },
    updateRole(id, role) {
      useBench.setState(state => {
        const next = state.users.slice();
        next[id] = {...state.users[id], role};
        return {users: next};
      });
    },
  };
  return {App, actions};
}

startBench('zustand', createApp);
