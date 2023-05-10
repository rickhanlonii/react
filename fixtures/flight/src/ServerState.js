let serverState = {};

export function setServerState(ss) {
  serverState = ss;
}

export function getServerState() {
  return serverState;
}
