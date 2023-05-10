'use server';

import {getServerState, setServerState} from './ServerState.js';

export async function comment(formData) {
  console.log('here')
  const ss = getServerState();
  console.log('here 2')
  const postId = formData.get('slug');
  setServerState({
    ...ss,
    [postId]: [
      ...(ss[postId] ? ss[postId] : []),
      formData.get('text')
    ]
  })
  console.log('here 3')
  return new Promise((resolve, reject) => resolve('Commented'));
}

export async function like() {
  setServerState('Liked!');
  return new Promise((resolve, reject) => resolve('Liked'));
}

export async function greet(formData) {
  const name = formData.get('name') || 'you';
  setServerState('Hi ' + name);
  const file = formData.get('file');
  if (file) {
    return `Ok, ${name}, here is ${file.name}:
      ${(await file.text()).toUpperCase()}
    `;
  }
  return 'Hi ' + name + '!';
}
