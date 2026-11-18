// Seed data for the derived-selectors scenario, ported from state.ts in
// reduxjs/react-redux-benchmarks (Copyright (c) 2018 Redux, MIT License).
// The original uses Math.random(). This uses a seeded generator, drawing in
// the same order, so every variant renders exactly the same data.

import {NUM_USERS, NUM_POSTS, NUM_COMMENTS, CATEGORIES} from './constants';
import {mulberry32} from '../common/random';

export const roles = ['admin', 'user'];

export function createSeedData(seed = 42) {
  const random = mulberry32(seed);
  const users = Array.from({length: NUM_USERS}, (_, i) => ({
    id: i,
    name: `User ${i}`,
    role: roles[i % roles.length],
  }));
  const posts = Array.from({length: NUM_POSTS}, (_, i) => ({
    id: i,
    userId: Math.floor(random() * NUM_USERS),
    title: `Post ${i}`,
    score: Math.floor(random() * 101),
    category: CATEGORIES[Math.floor(random() * CATEGORIES.length)],
  }));
  const comments = Array.from({length: NUM_COMMENTS}, (_, i) => ({
    id: i,
    postId: Math.floor(random() * NUM_POSTS),
    userId: Math.floor(random() * NUM_USERS),
    text: `Comment ${i}`,
  }));
  return {users, posts, comments};
}
