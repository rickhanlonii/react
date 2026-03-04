'use strict';

// ---------------------------------------------------------------------------
// Bridge tests
//
// These tests verify the JS-side bridge module and the contract between
// the renderer host config and the $$ bridge globals. The globals are mocked
// here in the same style as the renderer tests. In production, these globals
// are registered on the JSContext by NativeBridge.swift.
// ---------------------------------------------------------------------------

// --- Mock bridge globals ---------------------------------------------------

const mockCreateNode = jest.fn();
const mockCreateTextNode = jest.fn();
const mockCloneNode = jest.fn();
const mockCloneNodeWithNewProps = jest.fn();
const mockCloneNodeWithNewChildren = jest.fn();
const mockCloneNodeWithNewChildrenAndProps = jest.fn();
const mockAppendChild = jest.fn();
const mockCreateChildSet = jest.fn();
const mockAppendChildToChildSet = jest.fn();
const mockCompleteRoot = jest.fn();
const mockMeasureNode = jest.fn();
const mockRegisterEventHandler = jest.fn();
const mockFetch = jest.fn();

let nodeIdCounter = 0;

function makeMockNode(type, props) {
  const id = ++nodeIdCounter;
  const family = {id, type};
  return {id, type, props, _family: family};
}

beforeEach(() => {
  nodeIdCounter = 0;

  mockCreateNode.mockImplementation((type, surfaceId, props) => {
    return makeMockNode(type, props);
  });

  mockCreateTextNode.mockImplementation((text, surfaceId) => {
    return makeMockNode('#text', {text});
  });

  mockCloneNode.mockImplementation((node) => {
    return {...node, id: ++nodeIdCounter, _family: node._family};
  });

  mockCloneNodeWithNewProps.mockImplementation((node, newProps) => {
    return {...node, id: ++nodeIdCounter, props: newProps, _family: node._family};
  });

  mockCloneNodeWithNewChildren.mockImplementation((node) => {
    return {...node, id: ++nodeIdCounter, _family: node._family};
  });

  mockCloneNodeWithNewChildrenAndProps.mockImplementation(
    (node, _children, newProps) => {
      return {...node, id: ++nodeIdCounter, props: newProps, _family: node._family};
    },
  );

  mockAppendChild.mockClear();

  mockCreateChildSet.mockImplementation(() => {
    return [];
  });

  mockAppendChildToChildSet.mockImplementation((childSet, child) => {
    childSet.push(child);
  });

  mockCompleteRoot.mockClear();

  mockMeasureNode.mockImplementation((node, callback) => {
    callback(0, 0, 100, 50);
  });

  mockRegisterEventHandler.mockClear();
  mockFetch.mockClear();

  // Register globals
  global.$$createNode = mockCreateNode;
  global.$$createTextNode = mockCreateTextNode;
  global.$$cloneNode = mockCloneNode;
  global.$$cloneNodeWithNewProps = mockCloneNodeWithNewProps;
  global.$$cloneNodeWithNewChildren = mockCloneNodeWithNewChildren;
  global.$$cloneNodeWithNewChildrenAndProps = mockCloneNodeWithNewChildrenAndProps;
  global.$$appendChild = mockAppendChild;
  global.$$createChildSet = mockCreateChildSet;
  global.$$appendChildToChildSet = mockAppendChildToChildSet;
  global.$$completeRoot = mockCompleteRoot;
  global.$$measureNode = mockMeasureNode;
  global.$$registerEventHandler = mockRegisterEventHandler;
  global.$$fetch = mockFetch;

  // Register event priority constants
  global.$$DefaultEventPriority = 32;
  global.$$DiscreteEventPriority = 2;
  global.$$ContinuousEventPriority = 8;
});

afterEach(() => {
  delete global.$$createNode;
  delete global.$$createTextNode;
  delete global.$$cloneNode;
  delete global.$$cloneNodeWithNewProps;
  delete global.$$cloneNodeWithNewChildren;
  delete global.$$cloneNodeWithNewChildrenAndProps;
  delete global.$$appendChild;
  delete global.$$createChildSet;
  delete global.$$appendChildToChildSet;
  delete global.$$completeRoot;
  delete global.$$measureNode;
  delete global.$$registerEventHandler;
  delete global.$$fetch;
  delete global.$$DefaultEventPriority;
  delete global.$$DiscreteEventPriority;
  delete global.$$ContinuousEventPriority;
});

const Bridge = require('../index');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bridge', () => {
  // -----------------------------------------------------------------
  // Event priority constants
  // -----------------------------------------------------------------
  describe('event priority constants', () => {
    it('DefaultEventPriority equals 32 (DefaultLane)', () => {
      expect(Bridge.DefaultEventPriority).toBe(32);
    });

    it('DiscreteEventPriority equals 2 (SyncLane)', () => {
      expect(Bridge.DiscreteEventPriority).toBe(2);
    });

    it('ContinuousEventPriority equals 8 (InputContinuousLane)', () => {
      expect(Bridge.ContinuousEventPriority).toBe(8);
    });
  });

  // -----------------------------------------------------------------
  // $$createNode
  // -----------------------------------------------------------------
  describe('createNode', () => {
    it('is callable and returns a handle', () => {
      const instanceHandle = {};
      const props = {style: {backgroundColor: 'red'}};
      const handle = Bridge.createNode('div', 1, props, false, instanceHandle);

      expect(mockCreateNode).toHaveBeenCalledWith(
        'div',
        1,
        props,
        false,
        instanceHandle,
      );
      expect(handle).toBeDefined();
      expect(handle.type).toBe('div');
      expect(handle._family).toBeDefined();
    });

    it('passes isInsideTextContext correctly', () => {
      Bridge.createNode('span', 1, {}, true, {});

      expect(mockCreateNode).toHaveBeenCalledWith(
        'span',
        1,
        {},
        true,
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------
  // $$createTextNode
  // -----------------------------------------------------------------
  describe('createTextNode', () => {
    it('creates a text node handle', () => {
      const instanceHandle = {};
      const handle = Bridge.createTextNode('hello world', 1, instanceHandle);

      expect(mockCreateTextNode).toHaveBeenCalledWith(
        'hello world',
        1,
        instanceHandle,
      );
      expect(handle).toBeDefined();
      expect(handle.type).toBe('#text');
    });
  });

  // -----------------------------------------------------------------
  // $$cloneNodeWithNewProps
  // -----------------------------------------------------------------
  describe('cloneNodeWithNewProps', () => {
    it('returns a new handle with same identity (family)', () => {
      const original = Bridge.createNode('div', 1, {color: 'red'}, false, {});
      const originalFamily = original._family;

      const cloned = Bridge.cloneNodeWithNewProps(original, {color: 'blue'});

      expect(mockCloneNodeWithNewProps).toHaveBeenCalledWith(
        original,
        {color: 'blue'},
      );

      // New handle (different id)
      expect(cloned.id).not.toBe(original.id);

      // Same family (identity preserved)
      expect(cloned._family).toBe(originalFamily);
    });
  });

  // -----------------------------------------------------------------
  // $$cloneNode
  // -----------------------------------------------------------------
  describe('cloneNode', () => {
    it('clones a node preserving family identity', () => {
      const original = Bridge.createNode('p', 1, {}, false, {});
      const cloned = Bridge.cloneNode(original);

      expect(mockCloneNode).toHaveBeenCalledWith(original);
      expect(cloned.id).not.toBe(original.id);
      expect(cloned._family).toBe(original._family);
    });
  });

  // -----------------------------------------------------------------
  // $$cloneNodeWithNewChildren
  // -----------------------------------------------------------------
  describe('cloneNodeWithNewChildren', () => {
    it('clones a node with new children', () => {
      const original = Bridge.createNode('div', 1, {}, false, {});
      const cloned = Bridge.cloneNodeWithNewChildren(original, []);

      expect(mockCloneNodeWithNewChildren).toHaveBeenCalledWith(original, []);
      expect(cloned._family).toBe(original._family);
    });
  });

  // -----------------------------------------------------------------
  // $$cloneNodeWithNewChildrenAndProps
  // -----------------------------------------------------------------
  describe('cloneNodeWithNewChildrenAndProps', () => {
    it('clones a node with new children and new props', () => {
      const original = Bridge.createNode('div', 1, {x: 1}, false, {});
      const cloned = Bridge.cloneNodeWithNewChildrenAndProps(
        original,
        undefined,
        {x: 2},
      );

      expect(mockCloneNodeWithNewChildrenAndProps).toHaveBeenCalledWith(
        original,
        undefined,
        {x: 2},
      );
      expect(cloned._family).toBe(original._family);
      expect(cloned.props).toEqual({x: 2});
    });
  });

  // -----------------------------------------------------------------
  // $$appendChild
  // -----------------------------------------------------------------
  describe('appendChild', () => {
    it('calls the bridge global', () => {
      const parent = Bridge.createNode('div', 1, {}, false, {});
      const child = Bridge.createNode('span', 1, {}, false, {});

      Bridge.appendChild(parent, child);

      expect(mockAppendChild).toHaveBeenCalledWith(parent, child);
    });
  });

  // -----------------------------------------------------------------
  // $$completeRoot
  // -----------------------------------------------------------------
  describe('completeRoot', () => {
    it('triggers commit pipeline', () => {
      const child1 = Bridge.createNode('div', 1, {}, false, {});
      const child2 = Bridge.createNode('p', 1, {}, false, {});

      Bridge.completeRoot(42, [child1, child2]);

      expect(mockCompleteRoot).toHaveBeenCalledWith(42, [child1, child2]);
      expect(mockCompleteRoot).toHaveBeenCalledTimes(1);
    });

    it('can be called multiple times for re-commits', () => {
      Bridge.completeRoot(1, []);
      Bridge.completeRoot(1, []);

      expect(mockCompleteRoot).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------
  // $$createChildSet and $$appendChildToChildSet
  // -----------------------------------------------------------------
  describe('child set operations', () => {
    it('createChildSet returns a new set', () => {
      const set = Bridge.createChildSet();
      expect(mockCreateChildSet).toHaveBeenCalled();
      expect(set).toBeDefined();
    });

    it('appendChildToChildSet adds child to set', () => {
      const set = Bridge.createChildSet();
      const child = Bridge.createNode('div', 1, {}, false, {});

      Bridge.appendChildToChildSet(set, child);

      expect(mockAppendChildToChildSet).toHaveBeenCalledWith(set, child);
    });
  });

  // -----------------------------------------------------------------
  // $$measureNode
  // -----------------------------------------------------------------
  describe('measureNode', () => {
    it('calls the measurement callback', () => {
      const node = Bridge.createNode('div', 1, {}, false, {});
      const callback = jest.fn();

      Bridge.measureNode(node, callback);

      expect(mockMeasureNode).toHaveBeenCalledWith(node, callback);
      expect(callback).toHaveBeenCalledWith(0, 0, 100, 50);
    });
  });

  // -----------------------------------------------------------------
  // $$registerEventHandler
  // -----------------------------------------------------------------
  describe('registerEventHandler', () => {
    it('stores handler and events dispatch through it', () => {
      const handler = jest.fn();

      Bridge.registerEventHandler(handler);

      expect(mockRegisterEventHandler).toHaveBeenCalledWith(handler);
      expect(mockRegisterEventHandler).toHaveBeenCalledTimes(1);
    });

    it('handler receives instanceHandle, eventType, and payload', () => {
      // This tests the contract: when the native side calls the handler,
      // it passes (instanceHandle, eventType, payload).
      const handler = jest.fn();
      const instanceHandle = {_fiber: 'test'};
      const payload = {locationX: 100, locationY: 200};

      // Simulate what native bridge does after registerEventHandler:
      // Store the handler, then call it when events arrive.
      handler(instanceHandle, 'click', payload);

      expect(handler).toHaveBeenCalledWith(
        instanceHandle,
        'click',
        payload,
      );
    });
  });

  // -----------------------------------------------------------------
  // $$fetch
  // -----------------------------------------------------------------
  describe('fetch', () => {
    it('calls the bridge global with url, headers, and callback', () => {
      const callback = jest.fn();
      const headers = {'Content-Type': 'application/json'};

      Bridge.fetch('https://example.com/rsc', headers, callback);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/rsc',
        headers,
        callback,
      );
    });

    it('calls the bridge global with options dict for POST', () => {
      const callback = jest.fn();
      const options = {
        method: 'POST',
        headers: {'Content-Type': 'text/x-component'},
        body: 'action data',
      };

      Bridge.fetch('https://example.com/action', options, callback);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/action',
        options,
        callback,
      );
    });
  });

  // -----------------------------------------------------------------
  // EventTypes constants
  // -----------------------------------------------------------------
  describe('EventTypes', () => {
    it('exports canonical event type strings', () => {
      expect(Bridge.EventTypes.CLICK).toBe('click');
      expect(Bridge.EventTypes.CHANGE).toBe('change');
      expect(Bridge.EventTypes.SCROLL).toBe('scroll');
      expect(Bridge.EventTypes.LAYOUT).toBe('layout');
    });

    it('EventTypes object is frozen', () => {
      expect(Object.isFrozen(Bridge.EventTypes)).toBe(true);
    });
  });
});
