'use strict';

// Mock the bridge globals before requiring the module
global.$$sendInspectorMessage = jest.fn();
global.$$performanceNow = () => Date.now();

describe('RuntimeAgent', () => {
  beforeEach(() => {
    global.$$sendInspectorMessage.mockClear();
    jest.resetModules();
    require('../RuntimeAgent');
  });

  test('evaluate returns primitive result', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-1',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '2 + 2'},
    }));

    expect(global.$$sendInspectorMessage).toHaveBeenCalledTimes(1);
    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.type).toBe('cdp-response');
    expect(response.requestId).toBe('req-1');
    expect(response.result.result.type).toBe('number');
    expect(response.result.result.value).toBe(4);
  });

  test('evaluate returns string result', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-2',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '"hello"'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('string');
    expect(response.result.result.value).toBe('hello');
  });

  test('evaluate returns object with objectId', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-3',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '({a: 1, b: 2})'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('object');
    expect(response.result.result.objectId).toBeDefined();
    expect(response.result.result.className).toBe('Object');
  });

  test('evaluate catches errors and returns exceptionDetails', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-4',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: 'undefinedVar.foo'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.exceptionDetails).toBeDefined();
    expect(response.result.exceptionDetails.text).toContain('undefinedVar');
  });

  test('evaluate returns null as object subtype null', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-null',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: 'null'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('object');
    expect(response.result.result.subtype).toBe('null');
    expect(response.result.result.value).toBe(null);
  });

  test('evaluate returns undefined', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-undef',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: 'undefined'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('undefined');
  });

  test('evaluate returns array with subtype and length', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-arr',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '[1, 2, 3]'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('object');
    expect(response.result.result.subtype).toBe('array');
    expect(response.result.result.className).toBe('Array');
    expect(response.result.result.description).toBe('Array(3)');
  });

  test('evaluate returns function with description', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-fn',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '(function hello() { return 42; })'},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('function');
    expect(response.result.result.className).toBe('Function');
    expect(response.result.result.objectId).toBeDefined();
  });

  test('getProperties returns own properties of stored object', () => {
    // First, evaluate to get an objectId
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-5a',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '({x: 10, y: "hi"})'},
    }));

    const evalResponse = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    const objectId = evalResponse.result.result.objectId;

    global.$$sendInspectorMessage.mockClear();

    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-5b',
      domain: 'Runtime',
      method: 'getProperties',
      params: {objectId, ownProperties: true},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'x', value: expect.objectContaining({type: 'number', value: 10})}),
        expect.objectContaining({name: 'y', value: expect.objectContaining({type: 'string', value: 'hi'})}),
      ]),
    );
  });

  test('callFunctionOn invokes function on stored object', () => {
    // Evaluate to get an objectId for an object
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-cfo-1',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '({val: 42})'},
    }));

    const evalResponse = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    const objectId = evalResponse.result.result.objectId;

    global.$$sendInspectorMessage.mockClear();

    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-cfo-2',
      domain: 'Runtime',
      method: 'callFunctionOn',
      params: {
        objectId,
        functionDeclaration: 'function() { return this.val; }',
      },
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.result.type).toBe('number');
    expect(response.result.result.value).toBe(42);
  });

  test('releaseObject removes stored object', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-rel-1',
      domain: 'Runtime',
      method: 'evaluate',
      params: {expression: '({released: true})'},
    }));

    const evalResponse = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    const objectId = evalResponse.result.result.objectId;

    global.$$sendInspectorMessage.mockClear();

    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-rel-2',
      domain: 'Runtime',
      method: 'releaseObject',
      params: {objectId},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result).toEqual({});

    // getProperties after release should return empty
    global.$$sendInspectorMessage.mockClear();

    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-rel-3',
      domain: 'Runtime',
      method: 'getProperties',
      params: {objectId, ownProperties: true},
    }));

    const propsResponse = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(propsResponse.result.result).toEqual([]);
  });

  test('globalLexicalScopeNames returns empty names', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-gls',
      domain: 'Runtime',
      method: 'globalLexicalScopeNames',
      params: {},
    }));

    const response = JSON.parse(global.$$sendInspectorMessage.mock.calls[0][0]);
    expect(response.result.names).toEqual([]);
  });

  test('ignores requests for unknown domains', () => {
    global.$$handleCDPRequest(JSON.stringify({
      requestId: 'req-unknown',
      domain: 'UnknownDomain',
      method: 'someMethod',
      params: {},
    }));

    expect(global.$$sendInspectorMessage).not.toHaveBeenCalled();
  });
});
