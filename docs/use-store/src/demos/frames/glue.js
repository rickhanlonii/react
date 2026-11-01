// Connects a demo running in a frame to its explainer on the page. The page
// sends {__explainer: true, name, id, method, arg}; the frame calls
// demo[method](arg) and answers {__explainer: true, name, id, result} or
// {..., error}. The page waits for each answer before it sends the next
// command.
//
// A command runs inside the message event that carried it, not in a later
// microtask, because React picks an update's priority from the current
// event: a store.update() in a message event gets the default lane.

'use strict';

function getEnv() {
  const React = require('react');
  const ReactDOM = require('react-dom');
  const {createRoot} = require('react-dom/client');
  const Scheduler = require('scheduler');
  let container = document.getElementById('root');
  if (container === null) {
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
  }
  return {React, ReactDOM, createRoot, Scheduler, container};
}

function errorText(error) {
  return error && error.stack ? String(error.stack) : String(error);
}

function connect(name, createDemo) {
  const target = window.parent;
  const options = window.__explainerOptions || {};
  function post(message) {
    target.postMessage(Object.assign({__explainer: true, name}, message), '*');
  }

  let demo = null;
  try {
    demo = createDemo(Object.assign(getEnv(), options));
  } catch (error) {
    post({type: 'ready', error: errorText(error)});
    return;
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (
      event.source !== target ||
      message == null ||
      message.__explainer !== true ||
      message.name !== name ||
      message.id == null
    ) {
      return;
    }
    const method = demo[message.method];
    if (typeof method !== 'function') {
      post({id: message.id, error: 'Unknown method ' + message.method});
      return;
    }
    let result;
    try {
      result = method(message.arg);
    } catch (error) {
      post({id: message.id, error: errorText(error)});
      return;
    }
    Promise.resolve(result).then(
      value => post({id: message.id, result: value}),
      error => post({id: message.id, error: errorText(error)})
    );
  });

  post({type: 'ready'});
}

module.exports = {connect, getEnv};
