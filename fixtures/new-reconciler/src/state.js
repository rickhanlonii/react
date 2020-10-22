var _wr = function(type) {
  var orig = window.history[type];
  return function() {
    var rv = orig.apply(this, arguments);
    var e = new Event(type);
    e.arguments = arguments;
    window.dispatchEvent(e);
    return rv;
  };
};
window.history.pushState = _wr('pushState');
window.history.replaceState = _wr('replaceState');

export function getParam(key, type) {
  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(key);
  if (type === 'int') {
    try {
      return value ? parseInt(value) : 0;
    } catch {
      return 0;
    }
  }

  return value;
}

export function setParam(key, value) {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set(key, value);
  const newurl =
    window.location.protocol +
    '//' +
    window.location.host +
    window.location.pathname +
    '?' +
    urlParams.toString();
  window.history.pushState({path: newurl}, '', newurl);
}
