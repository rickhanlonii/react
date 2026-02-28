'use strict';

// Tests for the CDP Runtime $$ helpers registered by RemoteObject.js.
// These helpers are called directly by Swift CDP dispatch.

describe('CDP Runtime Helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    // Clear any previous globals
    delete global.$$evaluateForCDP;
    delete global.$$getOwnProperties;
    delete global.$$callFunctionOn;
    delete global.$$releaseObject;
    delete global.$$releaseAllObjects;
    require('../RemoteObject');
  });

  describe('$$evaluateForCDP', () => {
    test('returns primitive number result', () => {
      const result = global.$$evaluateForCDP('2 + 2', false);
      expect(result.result.type).toBe('number');
      expect(result.result.value).toBe(4);
    });

    test('returns string result', () => {
      const result = global.$$evaluateForCDP('"hello"', false);
      expect(result.result.type).toBe('string');
      expect(result.result.value).toBe('hello');
    });

    test('returns object with objectId', () => {
      const result = global.$$evaluateForCDP('({a: 1, b: 2})', false);
      expect(result.result.type).toBe('object');
      expect(result.result.objectId).toBeDefined();
      expect(result.result.className).toBe('Object');
    });

    test('catches errors and returns exceptionDetails', () => {
      const result = global.$$evaluateForCDP('undefinedVar.foo', false);
      expect(result.exceptionDetails).toBeDefined();
      expect(result.exceptionDetails.text).toContain('undefinedVar');
    });

    test('returns null as object subtype null', () => {
      const result = global.$$evaluateForCDP('null', false);
      expect(result.result.type).toBe('object');
      expect(result.result.subtype).toBe('null');
      expect(result.result.value).toBe(null);
    });

    test('returns undefined', () => {
      const result = global.$$evaluateForCDP('undefined', false);
      expect(result.result.type).toBe('undefined');
    });

    test('returns array with subtype and length', () => {
      const result = global.$$evaluateForCDP('[1, 2, 3]', false);
      expect(result.result.type).toBe('object');
      expect(result.result.subtype).toBe('array');
      expect(result.result.className).toBe('Array');
      expect(result.result.description).toBe('Array(3)');
    });

    test('returns function with description', () => {
      const result = global.$$evaluateForCDP('(function hello() { return 42; })', false);
      expect(result.result.type).toBe('function');
      expect(result.result.className).toBe('Function');
      expect(result.result.objectId).toBeDefined();
    });

    test('returnByValue serializes object as plain value', () => {
      const result = global.$$evaluateForCDP('({x: 1})', true);
      expect(result.result.type).toBe('object');
      expect(result.result.value).toEqual({x: 1});
      // No objectId when returned by value
      expect(result.result.objectId).toBeUndefined();
    });
  });

  describe('$$getOwnProperties', () => {
    test('returns own properties of stored object', () => {
      const evalResult = global.$$evaluateForCDP('({x: 10, y: "hi"})', false);
      const objectId = evalResult.result.objectId;

      const result = global.$$getOwnProperties(objectId, true);
      expect(result.result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({name: 'x', value: expect.objectContaining({type: 'number', value: 10})}),
          expect.objectContaining({name: 'y', value: expect.objectContaining({type: 'string', value: 'hi'})}),
        ]),
      );
    });

    test('returns empty for unknown objectId', () => {
      const result = global.$$getOwnProperties('nonexistent', true);
      expect(result.result).toEqual([]);
    });

    test('includes __proto__ when ownOnly is false', () => {
      const evalResult = global.$$evaluateForCDP('({a: 1})', false);
      const objectId = evalResult.result.objectId;

      const result = global.$$getOwnProperties(objectId, false);
      const protoEntry = result.result.find(p => p.name === '__proto__');
      expect(protoEntry).toBeDefined();
    });
  });

  describe('$$callFunctionOn', () => {
    test('invokes function on stored object', () => {
      const evalResult = global.$$evaluateForCDP('({val: 42})', false);
      const objectId = evalResult.result.objectId;

      const result = global.$$callFunctionOn(objectId, 'function() { return this.val; }', null);
      expect(result.result.type).toBe('number');
      expect(result.result.value).toBe(42);
    });

    test('passes arguments from JSON string', () => {
      const evalResult = global.$$evaluateForCDP('({base: 10})', false);
      const objectId = evalResult.result.objectId;

      const args = JSON.stringify([{value: 5}]);
      const result = global.$$callFunctionOn(objectId, 'function(n) { return this.base + n; }', args);
      expect(result.result.type).toBe('number');
      expect(result.result.value).toBe(15);
    });

    test('returns exceptionDetails on error', () => {
      const evalResult = global.$$evaluateForCDP('({})', false);
      const objectId = evalResult.result.objectId;

      const result = global.$$callFunctionOn(objectId, 'function() { throw new Error("boom"); }', null);
      expect(result.exceptionDetails).toBeDefined();
      expect(result.exceptionDetails.text).toContain('boom');
    });

    test('returns undefined for unknown objectId', () => {
      const result = global.$$callFunctionOn('nonexistent', 'function() { return 1; }', null);
      expect(result.result.type).toBe('undefined');
    });
  });

  describe('$$releaseObject / $$releaseAllObjects', () => {
    test('releaseObject removes stored object', () => {
      const evalResult = global.$$evaluateForCDP('({released: true})', false);
      const objectId = evalResult.result.objectId;

      global.$$releaseObject(objectId);

      // getOwnProperties after release should return empty
      const result = global.$$getOwnProperties(objectId, true);
      expect(result.result).toEqual([]);
    });

    test('releaseAllObjects clears all stored objects', () => {
      const eval1 = global.$$evaluateForCDP('({a: 1})', false);
      const eval2 = global.$$evaluateForCDP('({b: 2})', false);

      global.$$releaseAllObjects();

      expect(global.$$getOwnProperties(eval1.result.objectId, true).result).toEqual([]);
      expect(global.$$getOwnProperties(eval2.result.objectId, true).result).toEqual([]);
    });
  });
});
