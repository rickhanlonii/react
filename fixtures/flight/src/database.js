let serverState = {};

export const db = {
  Comments: {
    async getByPost(postId) {
      if (serverState[postId]) {
        return serverState[postId];
      }
      return [];
    },
    async insert(newComment) {
      const postId = newComment.postId;
      if (!serverState[postId]) {
        serverState[postId] = []
      }
      serverState[postId].push(newComment);
    }
  }
}
