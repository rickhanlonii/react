// jsdom smoke test of the frame scripts (not a gate: the gates use Chrome).
// inspectStore must never run the reducer by default, and computeHead must be
// muted and never throw.
//   node docs/use-store/tools/fixtures/smoke-inspector.mjs
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../../../package.json'));
const {JSDOM} = require('jsdom');
const {transform} = require('sucrase');
const docs = path.resolve(here, '../..') + '/';
const read = f => fs.readFileSync(docs + f, 'utf8');

async function makeFrame({runtime = 'dev', server = false, strict = false} = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  const out = [];
  const parentStub = {postMessage: m => out.push(JSON.parse(JSON.stringify(m)))};
  Object.defineProperty(w, 'parent', {get: () => parentStub});
  w.__SANDBOX__ = {id: 't', runtime, strict};
  // jsdom lacks these; browsers have them.
  w.MessageChannel = MessageChannel; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.ReadableStream = ReadableStream;
  w.eval(read('sandbox/frame-hook.js'));
  w.eval(read(runtime === 'step' ? 'vendor/react-step.js' : 'vendor/react-dev.js'));
  if (server) w.eval(read('vendor/react-server-dev.js'));
  w.eval(read('sandbox/frame.js'));
  const send = (type, fields = {}) => {
    const ev = new w.MessageEvent('message', {data: {__sandbox: 1, id: 't', type, ...fields}});
    Object.defineProperty(ev, 'source', {get: () => parentStub});
    w.dispatchEvent(ev);
  };
  const run = async code => {
    send('run', {code: transform(code, {transforms: ['jsx', 'imports'], jsxRuntime: 'automatic', production: true}).code});
    await until(() => out.some(m => m.type === 'ran'));
  };
  return {w, out, send, run};
}
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timeout'); await new Promise(r => setTimeout(r, 10)); }
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const types = out => out.map(m => m.type + (m.type === 'console' ? ':' + m.kind + ':' + m.text.slice(0, 80) : m.type === 'error' ? ':' + m.phase + ':' + m.message : '')).join('\n  ');
const last = (out, type) => out.filter(m => m.type === type).at(-1);


{
  const f = await makeFrame();
  await f.run(`
import {use, unstable_createStore as createStore} from 'react';
export const logging = createStore(0, (s, a) => { log('reducer ran', a); console.log('console in reducer'); return s + a; });
export const throwing = createStore(0, (s, a) => { if (a === 'boom') throw new Error('boom in reducer'); return s + a; });
window.__stores = {logging, throwing};
export default function App() { return <p>{use(logging)} {use(throwing)}</p>; }`);
  await tick();
  const {logging, throwing} = f.w.__stores;
  const consoleCount = () => f.out.filter(m => m.type === 'console').length;
  // Queue updates synchronously, then inspect before React renders them.
  logging.update(5);
  throwing.update(1);
  throwing.update('boom');
  const before = consoleCount();
  let threw = null, a, b, c, d;
  try {
    a = f.w.inspectStore(logging);
    b = f.w.inspectStore(logging, {computeHead: true});
    c = f.w.inspectStore(throwing);
    d = f.w.inspectStore(throwing, {computeHead: true});
  } catch (e) { threw = e; }
  const after = consoleCount();
  console.log('threw:', threw && threw.message);
  console.log('console lines added by inspection:', after - before, '(want 0)');
  console.log('logging default:', 'head' in a, a.headBase, JSON.stringify(a.headQueue));
  console.log('logging computeHead:', b.head, b.headBase, b.headError);
  console.log('throwing default: head in?', 'head' in c, JSON.stringify(c.headQueue));
  console.log('throwing computeHead:', d.head, d.headError && d.headError.message);
  console.log('store untouched:', logging._head, JSON.stringify(logging._headQueue), throwing._head, JSON.stringify(throwing._headQueue));
  const ok = !threw && after === before && !('head' in a) && b.head === 5 && d.head === 1 && d.headError && d.headError.message === 'boom in reducer' && logging._headQueue && logging._headQueue.length === 1;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}
