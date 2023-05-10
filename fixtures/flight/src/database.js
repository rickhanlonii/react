import 'server-only';

let serverState = {
  posts: {},
};

export const db = {
  async findCommentsForPost(postId) {
    if (serverState.posts[postId]) {
      return serverState.posts[postId];
    }
    return [];
  },
  async insertComment(newComment) {
    const postId = newComment.postId;
    if (!serverState.posts[postId]) {
      serverState.posts[postId] = []
    }
    serverState.posts[postId].push(newComment);
  },
  async saveTheme(theme) {
    serverState.theme = theme;
    await new Promise(resolve => {
      setTimeout(resolve, 800);
    });
  },
  async readTheme() {
    return serverState.theme || null;
  }
}
