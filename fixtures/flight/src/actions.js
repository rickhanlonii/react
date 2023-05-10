'use server';

import {getServerState, setServerState} from './ServerState.js';


function getColor(){ 
  const h = 360 * Math.random();
  const s = (25 + 70 * Math.random());
  const l = (85 + 10 * Math.random());
  const rgb = HSLToRGB(h, s, l)
  return 'rgb(' + rgb.join(',') + ')';
}

const HSLToRGB = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
};

export async function comment(formData) {
  console.log('here')
  const ss = getServerState();
  console.log('here 2')
  const postId = formData.get('slug');
  setServerState({
    ...ss,
    [postId]: [
      ...(ss[postId] ? ss[postId] : []),
      {
        text: formData.get('text'),
        color: getColor()
      }
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
