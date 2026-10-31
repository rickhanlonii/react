// The derivations from selectors.ts in reduxjs/react-redux-benchmarks
// (Copyright (c) 2018 Redux, MIT License), as plain functions for the variants
// that don't use createSelector. The bodies are the createSelector result
// functions, unchanged. The Redux variant keeps its own copy, as written.

import {derivation} from '../common/instrument';

// Tier 2: comment count for a post
export const getCommentCount = derivation(
  (comments, postId) => comments.filter(c => c.postId === postId).length
);

// Tier 3: all posts for a user, sorted by score desc
export const getPostsByUser = derivation((posts, userId) =>
  posts.filter(p => p.userId === userId).sort((a, b) => b.score - a.score)
);

// Tier 4: aggregate stats for a category
export const getCategoryStats = derivation((posts, comments, category) => {
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
});
