'use strict';

// Test the polyfill in isolation — don't rely on a global ReadableStream
const {installReadableStreamPolyfill} = require('../ReadableStream');

describe('ReadableStream polyfill', () => {
  let ReadableStream;

  beforeEach(() => {
    // Install into a fresh object to avoid polluting globals
    const target = {};
    installReadableStreamPolyfill(target);
    ReadableStream = target.ReadableStream;
  });

  it('calls start callback with controller', () => {
    let ctrl;
    new ReadableStream({
      start(controller) {
        ctrl = controller;
      },
    });
    expect(ctrl).toBeDefined();
    expect(typeof ctrl.enqueue).toBe('function');
    expect(typeof ctrl.close).toBe('function');
    expect(typeof ctrl.error).toBe('function');
  });

  it('reads enqueued chunks in order', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.enqueue(new Uint8Array([1, 2, 3]));
    ctrl.enqueue(new Uint8Array([4, 5, 6]));
    ctrl.close();

    const r1 = await reader.read();
    expect(r1).toEqual({value: new Uint8Array([1, 2, 3]), done: false});
    const r2 = await reader.read();
    expect(r2).toEqual({value: new Uint8Array([4, 5, 6]), done: false});
    const r3 = await reader.read();
    expect(r3).toEqual({value: undefined, done: true});
  });

  it('read() waits for enqueue when buffer is empty', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const promise = reader.read();
    let resolved = false;
    promise.then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 10));
    expect(resolved).toBe(false);

    ctrl.enqueue(new Uint8Array([42]));
    const result = await promise;
    expect(result).toEqual({value: new Uint8Array([42]), done: false});
  });

  it('read() resolves immediately when closed with empty buffer', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.close();
    const result = await reader.read();
    expect(result).toEqual({value: undefined, done: true});
  });

  it('pending read resolves on close', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const promise = reader.read();
    ctrl.close();
    const result = await promise;
    expect(result).toEqual({value: undefined, done: true});
  });

  it('propagates errors via controller.error()', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.error(new Error('stream failed'));
    await expect(reader.read()).rejects.toThrow('stream failed');
  });

  it('pending read rejects on error', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const promise = reader.read();
    ctrl.error(new Error('oops'));
    await expect(promise).rejects.toThrow('oops');
  });

  it('getReader() throws if stream is already locked', () => {
    const stream = new ReadableStream({ start() {} });
    stream.getReader();
    expect(() => stream.getReader()).toThrow('locked');
  });

  it('enqueue throws after close', () => {
    let ctrl;
    new ReadableStream({
      start(c) { ctrl = c; },
    });
    ctrl.close();
    expect(() => ctrl.enqueue(new Uint8Array([1]))).toThrow();
  });

  it('works with string chunks', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.enqueue('hello');
    ctrl.close();

    const r1 = await reader.read();
    expect(r1).toEqual({value: 'hello', done: false});
    const r2 = await reader.read();
    expect(r2).toEqual({value: undefined, done: true});
  });

  it('handles multiple pending reads rejected on error', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const p1 = reader.read();
    ctrl.error(new Error('fail'));
    await expect(p1).rejects.toThrow('fail');
    // Subsequent reads also reject
    await expect(reader.read()).rejects.toThrow('fail');
  });
});
