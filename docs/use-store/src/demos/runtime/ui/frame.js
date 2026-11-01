// Creates a frame that runs one demo, and a proxy to call it.
//
//   const frame = createFrame({name: 'queue', script: 'queue', bundle: 'step', ...});
//   const snapshot = await frame.call('dispatch', {kind: 'default', ops: [...]});
//
// The frame loads the vendored React build (bundle 'dev': the development
// build; 'step': the development build with scheduler/unstable_mock), the
// sandbox frame helpers (sandbox/API.md), then the demo's generated script,
// which connects back through src/demos/frames/glue.js. Calls are queued:
// each one waits for the previous answer.

import {paths} from './paths';

const CALL_TIMEOUT = 15000;

function escapeAttr(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function scriptTag(src) {
  return '<script src="' + escapeAttr(src) + '"></script>';
}

let nextFrame = 0;

// The same frame the sandbox host builds (sandbox/host.js createFrame):
// frame-hook.js before React, the vendored build, frame.js (the require
// shim, inspectStore, the render counts and flashes), then the demo's
// script. The host's `run` message never comes; the demo connects through
// src/demos/frames/glue.js instead.
function srcdoc({name, bundle, script, options, css}) {
  const config = {id: 'explainer-' + name + '-' + nextFrame++, runtime: bundle};
  const vendor = bundle === 'step' ? paths.vendorStep : paths.vendorDev;
  return [
    '<!doctype html><html style="color-scheme:dark"><head><meta charset="utf-8">',
    '<link rel="stylesheet" href="' + escapeAttr(paths.frameCss) + '">',
    '<style>' + css + '</style>',
    '</head><body><div id="root"></div>',
    '<script>window.__SANDBOX__ = ' +
      JSON.stringify(config).replace(/</g, '\\u003c') +
      '; window.__explainerOptions = ' +
      JSON.stringify(options || {}).replace(/</g, '\\u003c') +
      ';</script>',
    scriptTag(paths.frameHook),
    scriptTag(vendor),
    scriptTag(paths.frame),
    scriptTag(paths.generated + script + '.frame.js'),
    '</body></html>',
  ].join('');
}

export function createFrame({
  name,
  script,
  bundle,
  options,
  title,
  className,
  css = '',
}) {
  const iframe = document.createElement('iframe');
  iframe.title = title;
  iframe.className = 'ex-frame' + (className ? ' ' + className : '');
  iframe.setAttribute('loading', 'eager');
  iframe.srcdoc = srcdoc({name, bundle, script, options, css});

  const pending = new Map();
  let nextId = 1;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const readyTimer = setTimeout(
    () => rejectReady(new Error('The ' + name + ' frame did not load.')),
    CALL_TIMEOUT
  );

  function onMessage(event) {
    if (event.source !== iframe.contentWindow) {
      return;
    }
    const message = event.data;
    if (
      message == null ||
      message.__explainer !== true ||
      message.name !== name
    ) {
      return;
    }
    if (message.type === 'ready') {
      clearTimeout(readyTimer);
      if (message.error) {
        rejectReady(new Error(message.error));
      } else {
        resolveReady();
      }
      return;
    }
    const call = pending.get(message.id);
    if (call === undefined) {
      return;
    }
    pending.delete(message.id);
    clearTimeout(call.timer);
    if ('error' in message) {
      call.reject(new Error(message.error));
    } else {
      call.resolve(message.result);
    }
  }
  window.addEventListener('message', onMessage);

  let chain = ready;
  function call(method, arg) {
    const result = chain.then(
      () =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(
              new Error('The ' + name + ' frame did not answer ' + method + '.')
            );
          }, CALL_TIMEOUT);
          pending.set(id, {resolve, reject, timer});
          iframe.contentWindow.postMessage(
            {__explainer: true, name, id, method, arg},
            '*'
          );
        })
    );
    chain = result.catch(() => {});
    return result;
  }

  return {iframe, ready, call};
}

// A proxy with the frame's methods, for the checks in queue-check.js and
// friends, which call frame.reset(), frame.step() and so on.
export function methods(frame, names) {
  const proxy = {};
  for (const method of names) {
    proxy[method] = arg => frame.call(method, arg);
  }
  return proxy;
}
