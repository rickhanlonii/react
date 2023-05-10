import 'server-only';

let serverState = {
  posts: {},
};

export const db = {
  async findCommentsForPost(postId, options = {}) {
    if (options.slowdown) {
      await new Promise(resolve => setTimeout(resolve, options.slowdown));
    }
    if (serverState.posts[postId]) {
      return serverState.posts[postId];
    }
    return [];
  },
  async insertComment(newComment, options = {}) {
    if (options.slowdown) {
      await new Promise(resolve => setTimeout(resolve, options.slowdown));
    }
    const postId = newComment.postId;
    if (!serverState.posts[postId]) {
      serverState.posts[postId] = []
    }
    serverState.posts[postId].push(newComment);
  },
  async saveTheme(theme, options = {}) {
    if (options.slowdown) {
      await new Promise(resolve => setTimeout(resolve, options.slowdown));
    }
    serverState.theme = theme;
    await new Promise(resolve => {
      setTimeout(resolve, 800);
    });
  },
  async readTheme(options) {
    if (options.slowdown) {
      await new Promise(resolve => setTimeout(resolve, options.slowdown));
    }
    return serverState.theme || null;
  }
}
