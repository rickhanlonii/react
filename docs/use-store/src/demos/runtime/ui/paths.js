// Where the explainers find the vendored React builds, the frame helpers and
// their generated frame scripts, relative to this script
// (docs/use-store/sandbox/explainers/generated/explainers.js).

function scriptUrl() {
  const current = document.currentScript;
  if (current && current.src) {
    return current.src;
  }
  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    if (/explainers\/generated\/explainers\.js(\?|#|$)/.test(scripts[i].src)) {
      return scripts[i].src;
    }
  }
  return document.baseURI;
}

// Evaluated when the bundle runs, while document.currentScript is still set.
const generated = new URL('./', scriptUrl()).href;
const docs = new URL('../../../', generated).href;

export const paths = {
  generated,
  docs,
  vendorDev: docs + 'vendor/react-dev.js',
  vendorStep: docs + 'vendor/react-step.js',
  frameHook: docs + 'sandbox/frame-hook.js',
  frame: docs + 'sandbox/frame.js',
  frameCss: docs + 'sandbox/frame.css',
};
