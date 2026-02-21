'use strict';

let messages = [];
global.$$sendInspectorMessage = jest.fn(function (json) {
  messages.push(JSON.parse(json));
});
global.$$performanceNow = () => 1234;

// Save original console methods before any wrapping
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;
const originalDebug = console.debug;

describe('ConsoleForwarding', () => {
  beforeEach(() => {
    // Restore original console methods to prevent re-wrapping accumulation
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
    console.debug = originalDebug;

    messages = [];
    global.$$sendInspectorMessage.mockClear();
    jest.resetModules();
    require('../ConsoleForwarding');
  });

  afterAll(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
    console.debug = originalDebug;
  });

  test('console.log with string sends string RemoteObject', () => {
    console.log('hello');
    expect(messages.length).toBe(1);
    const msg = messages[0];
    expect(msg.type).toBe('console-message');
    expect(msg.cdpType).toBe('log');
    expect(msg.args[0].type).toBe('string');
    expect(msg.args[0].value).toBe('hello');
  });

  test('console.log with object sends object RemoteObject with objectId', () => {
    console.log({foo: 'bar'});
    expect(messages.length).toBe(1);
    const msg = messages[0];
    expect(msg.args[0].type).toBe('object');
    expect(msg.args[0].objectId).toBeDefined();
    expect(msg.args[0].className).toBe('Object');
  });

  test('console.log with array sends array subtype', () => {
    console.log([1, 2, 3]);
    expect(messages.length).toBe(1);
    expect(messages[0].args[0].subtype).toBe('array');
    expect(messages[0].args[0].className).toBe('Array');
    expect(messages[0].args[0].description).toBe('Array(3)');
  });

  test('console.warn maps to cdpType warning', () => {
    console.warn('watch out');
    expect(messages.length).toBe(1);
    expect(messages[0].cdpType).toBe('warning');
  });

  test('console.error includes stack trace', () => {
    console.error('test error');
    expect(messages.length).toBe(1);
    const msg = messages[0];
    expect(msg.stackTrace).toBeDefined();
    expect(msg.stackTrace.callFrames).toBeDefined();
    expect(Array.isArray(msg.stackTrace.callFrames)).toBe(true);
  });

  test('console.warn includes stack trace', () => {
    console.warn('test warning');
    expect(messages.length).toBe(1);
    expect(messages[0].stackTrace).toBeDefined();
  });

  test('console.log does not include stack trace', () => {
    console.log('no trace');
    expect(messages.length).toBe(1);
    expect(messages[0].stackTrace).toBeUndefined();
  });

  test('console.log with multiple args serializes all', () => {
    console.log('count:', 42, true);
    expect(messages.length).toBe(1);
    const args = messages[0].args;
    expect(args.length).toBe(3);
    expect(args[0]).toEqual({type: 'string', value: 'count:'});
    expect(args[1].type).toBe('number');
    expect(args[1].value).toBe(42);
    expect(args[2]).toEqual({type: 'boolean', value: true});
  });

  test('console.log with null and undefined', () => {
    console.log(null, undefined);
    expect(messages.length).toBe(1);
    const args = messages[0].args;
    expect(args[0]).toEqual({type: 'object', subtype: 'null', value: null});
    expect(args[1]).toEqual({type: 'undefined'});
  });

  test('includes timestamp from $$performanceNow', () => {
    console.log('ts');
    expect(messages[0].timestamp).toBe(1234);
  });
});
