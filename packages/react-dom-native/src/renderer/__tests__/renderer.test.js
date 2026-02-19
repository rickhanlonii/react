'use strict';

// Mock bridge globals before importing HostConfig
const mockCreateNode = jest.fn();
const mockCreateTextNode = jest.fn();
const mockAppendChild = jest.fn();
const mockCloneNodeWithNewProps = jest.fn();
const mockCloneNodeWithNewChildrenAndProps = jest.fn();
const mockCompleteRoot = jest.fn();
const mockGetFirstSSRChild = jest.fn();
const mockGetSSRChildOf = jest.fn();
const mockGetNextSSRSibling = jest.fn();
const mockSetInstanceHandle = jest.fn();

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

  mockAppendChild.mockClear();

  mockCloneNodeWithNewProps.mockImplementation((node, newProps) => {
    return {...node, id: ++nodeIdCounter, props: newProps, _family: node._family};
  });

  mockCloneNodeWithNewChildrenAndProps.mockImplementation(
    (node, _children, newProps) => {
      return {...node, id: ++nodeIdCounter, props: newProps, _family: node._family};
    },
  );

  mockCompleteRoot.mockClear();
  mockGetFirstSSRChild.mockClear();
  mockGetSSRChildOf.mockClear();
  mockGetNextSSRSibling.mockClear();
  mockSetInstanceHandle.mockClear();

  // Register globals
  global.$$createNode = mockCreateNode;
  global.$$createTextNode = mockCreateTextNode;
  global.$$appendChild = mockAppendChild;
  global.$$cloneNodeWithNewProps = mockCloneNodeWithNewProps;
  global.$$cloneNodeWithNewChildrenAndProps = mockCloneNodeWithNewChildrenAndProps;
  global.$$completeRoot = mockCompleteRoot;
  global.$$getFirstSSRChild = mockGetFirstSSRChild;
  global.$$getSSRChildOf = mockGetSSRChildOf;
  global.$$getNextSSRSibling = mockGetNextSSRSibling;
  global.$$setInstanceHandle = mockSetInstanceHandle;
});

afterEach(() => {
  delete global.$$createNode;
  delete global.$$createTextNode;
  delete global.$$appendChild;
  delete global.$$cloneNodeWithNewProps;
  delete global.$$cloneNodeWithNewChildrenAndProps;
  delete global.$$completeRoot;
  delete global.$$getFirstSSRChild;
  delete global.$$getSSRChildOf;
  delete global.$$getNextSSRSibling;
  delete global.$$setInstanceHandle;
});

const HostConfig = require('../HostConfig');

describe('HostConfig', () => {
  const rootContainer = {surfaceId: 1};
  const defaultContext = {isInsideTextContext: false};
  const textContext = {isInsideTextContext: true};
  const internalHandle = {};

  // -------------------------------------------------------------------
  // createInstance
  // -------------------------------------------------------------------
  describe('createInstance', () => {
    it('calls $$createNode and returns correct Instance shape', () => {
      const props = {style: {backgroundColor: 'red'}};
      const instance = HostConfig.createInstance(
        'div',
        props,
        rootContainer,
        defaultContext,
        internalHandle,
      );

      expect(mockCreateNode).toHaveBeenCalledWith(
        'div',
        1,
        props,
        false,
        internalHandle,
      );
      expect(instance.type).toBe('div');
      expect(instance.props).toBe(props);
      expect(instance.children).toEqual([]);
      expect(instance._nativeNode).toBeDefined();
      expect(instance._nativeFamily).toBeDefined();
      expect(instance._internalInstanceHandle).toBe(internalHandle);
    });

    it('passes isInsideTextContext from hostContext', () => {
      HostConfig.createInstance(
        'span',
        {},
        rootContainer,
        textContext,
        internalHandle,
      );

      expect(mockCreateNode).toHaveBeenCalledWith(
        'span',
        1,
        {},
        true,
        internalHandle,
      );
    });
  });

  // -------------------------------------------------------------------
  // createTextInstance
  // -------------------------------------------------------------------
  describe('createTextInstance', () => {
    it('calls $$createTextNode and returns correct TextInstance shape', () => {
      const textInstance = HostConfig.createTextInstance(
        'hello',
        rootContainer,
        defaultContext,
        internalHandle,
      );

      expect(mockCreateTextNode).toHaveBeenCalledWith(
        'hello',
        1,
        internalHandle,
      );
      expect(textInstance.text).toBe('hello');
      expect(textInstance._nativeNode).toBeDefined();
      expect(textInstance._nativeFamily).toBeDefined();
      expect(textInstance._internalInstanceHandle).toBe(internalHandle);
    });
  });

  // -------------------------------------------------------------------
  // appendInitialChild
  // -------------------------------------------------------------------
  describe('appendInitialChild', () => {
    it('calls $$appendChild and updates children array', () => {
      const parent = HostConfig.createInstance(
        'div',
        {},
        rootContainer,
        defaultContext,
        internalHandle,
      );
      const child = HostConfig.createInstance(
        'span',
        {},
        rootContainer,
        defaultContext,
        {},
      );

      HostConfig.appendInitialChild(parent, child);

      expect(mockAppendChild).toHaveBeenCalledWith(
        parent._nativeNode,
        child._nativeNode,
      );
      expect(parent.children).toEqual([child]);
    });

    it('appends multiple children in order', () => {
      const parent = HostConfig.createInstance(
        'div',
        {},
        rootContainer,
        defaultContext,
        internalHandle,
      );
      const child1 = HostConfig.createInstance(
        'p',
        {},
        rootContainer,
        defaultContext,
        {},
      );
      const child2 = HostConfig.createTextInstance(
        'text',
        rootContainer,
        defaultContext,
        {},
      );

      HostConfig.appendInitialChild(parent, child1);
      HostConfig.appendInitialChild(parent, child2);

      expect(parent.children).toEqual([child1, child2]);
      expect(mockAppendChild).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------
  // cloneInstance
  // -------------------------------------------------------------------
  describe('cloneInstance', () => {
    it('with keepChildren=true calls $$cloneNodeWithNewProps and preserves _nativeFamily', () => {
      const oldProps = {style: {color: 'red'}};
      const newProps = {style: {color: 'blue'}};
      const instance = HostConfig.createInstance(
        'div',
        oldProps,
        rootContainer,
        defaultContext,
        internalHandle,
      );

      const cloned = HostConfig.cloneInstance(
        instance,
        'div',
        oldProps,
        newProps,
        true, // keepChildren
        null,
      );

      expect(mockCloneNodeWithNewProps).toHaveBeenCalledWith(
        instance._nativeNode,
        newProps,
      );
      expect(cloned._nativeFamily).toBe(instance._nativeFamily);
      expect(cloned.props).toBe(newProps);
      expect(cloned.type).toBe('div');
      expect(cloned._nativeNode).not.toBe(instance._nativeNode);
    });

    it('with keepChildren=true preserves children array', () => {
      const instance = HostConfig.createInstance(
        'div',
        {},
        rootContainer,
        defaultContext,
        internalHandle,
      );
      const child = HostConfig.createInstance(
        'span',
        {},
        rootContainer,
        defaultContext,
        {},
      );
      HostConfig.appendInitialChild(instance, child);

      const cloned = HostConfig.cloneInstance(
        instance,
        'div',
        {},
        {updated: true},
        true,
        null,
      );

      expect(cloned.children).toBe(instance.children);
      expect(cloned.children).toEqual([child]);
    });

    it('with keepChildren=false calls $$cloneNodeWithNewChildrenAndProps and returns empty children', () => {
      const instance = HostConfig.createInstance(
        'div',
        {},
        rootContainer,
        defaultContext,
        internalHandle,
      );
      const child = HostConfig.createInstance(
        'span',
        {},
        rootContainer,
        defaultContext,
        {},
      );
      HostConfig.appendInitialChild(instance, child);

      const cloned = HostConfig.cloneInstance(
        instance,
        'div',
        {},
        {updated: true},
        false, // keepChildren = false
        null,
      );

      expect(mockCloneNodeWithNewChildrenAndProps).toHaveBeenCalledWith(
        instance._nativeNode,
        undefined,
        {updated: true},
      );
      expect(cloned.children).toEqual([]);
      expect(cloned._nativeFamily).toBe(instance._nativeFamily);
    });
  });

  // -------------------------------------------------------------------
  // replaceContainerChildren
  // -------------------------------------------------------------------
  describe('replaceContainerChildren', () => {
    it('calls $$completeRoot with child node handles', () => {
      const container = {
        surfaceId: 42,
        currentTree: null,
        pendingTree: 'pending',
      };

      const child1 = HostConfig.createInstance(
        'div',
        {},
        rootContainer,
        defaultContext,
        {},
      );
      const child2 = HostConfig.createInstance(
        'p',
        {},
        rootContainer,
        defaultContext,
        {},
      );

      const childSet = HostConfig.createContainerChildSet();
      HostConfig.appendChildToContainerChildSet(childSet, child1);
      HostConfig.appendChildToContainerChildSet(childSet, child2);

      HostConfig.replaceContainerChildren(container, childSet);

      expect(mockCompleteRoot).toHaveBeenCalledWith(42, [
        child1._nativeNode,
        child2._nativeNode,
      ]);
      expect(container.currentTree).toBe('pending');
      expect(container.pendingTree).toBe(null);
    });
  });

  // -------------------------------------------------------------------
  // Context functions
  // -------------------------------------------------------------------
  describe('context functions', () => {
    it('getRootHostContext returns isInsideTextContext: false', () => {
      const ctx = HostConfig.getRootHostContext();
      expect(ctx).toEqual({isInsideTextContext: false});
    });

    it('getChildHostContext returns text context for <p>', () => {
      const ctx = HostConfig.getChildHostContext(defaultContext, 'p');
      expect(ctx.isInsideTextContext).toBe(true);
    });

    it('getChildHostContext returns text context for heading elements', () => {
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        const ctx = HostConfig.getChildHostContext(defaultContext, tag);
        expect(ctx.isInsideTextContext).toBe(true);
      }
    });

    it('getChildHostContext returns text context for <span>', () => {
      const ctx = HostConfig.getChildHostContext(defaultContext, 'span');
      expect(ctx.isInsideTextContext).toBe(true);
    });

    it('getChildHostContext returns text context for inline elements', () => {
      for (const tag of ['strong', 'em', 'a', 'b', 'i', 'u']) {
        const ctx = HostConfig.getChildHostContext(defaultContext, tag);
        expect(ctx.isInsideTextContext).toBe(true);
      }
    });

    it('getChildHostContext returns non-text context for <div>', () => {
      const ctx = HostConfig.getChildHostContext(defaultContext, 'div');
      expect(ctx.isInsideTextContext).toBe(false);
    });

    it('getChildHostContext resets text context for block elements inside text', () => {
      const ctx = HostConfig.getChildHostContext(textContext, 'div');
      expect(ctx.isInsideTextContext).toBe(false);
    });

    it('getChildHostContext preserves text context for text elements inside text', () => {
      const ctx = HostConfig.getChildHostContext(textContext, 'span');
      expect(ctx).toBe(textContext); // Same reference — no new object
    });

    it('getChildHostContext preserves non-text context for block elements', () => {
      const ctx = HostConfig.getChildHostContext(defaultContext, 'div');
      expect(ctx).toBe(defaultContext); // Same reference
    });
  });

  // -------------------------------------------------------------------
  // Simple functions
  // -------------------------------------------------------------------
  describe('simple functions', () => {
    it('shouldSetTextContent returns false', () => {
      expect(HostConfig.shouldSetTextContent('div', {})).toBe(false);
      expect(HostConfig.shouldSetTextContent('span', {children: 'text'})).toBe(false);
    });

    it('finalizeInitialChildren returns false', () => {
      expect(
        HostConfig.finalizeInitialChildren({}, 'div', {}, defaultContext),
      ).toBe(false);
    });

    it('getPublicInstance returns instance as-is', () => {
      const instance = {_nativeNode: {}};
      expect(HostConfig.getPublicInstance(instance)).toBe(instance);
    });

    it('prepareForCommit returns null', () => {
      expect(HostConfig.prepareForCommit()).toBe(null);
    });
  });

  // -------------------------------------------------------------------
  // Mode flags
  // -------------------------------------------------------------------
  describe('mode flags', () => {
    it('supports persistence', () => {
      expect(HostConfig.supportsPersistence).toBe(true);
    });

    it('does not support mutation', () => {
      expect(HostConfig.supportsMutation).toBe(false);
    });

    it('supports hydration', () => {
      expect(HostConfig.supportsHydration).toBe(true);
    });

    it('supports microtasks', () => {
      expect(HostConfig.supportsMicrotasks).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Hidden instance cloning
  // -------------------------------------------------------------------
  describe('cloneHiddenInstance', () => {
    it('clones with display: none style', () => {
      const instance = HostConfig.createInstance(
        'div',
        {style: {color: 'red'}},
        rootContainer,
        defaultContext,
        internalHandle,
      );

      const hidden = HostConfig.cloneHiddenInstance(
        instance,
        'div',
        {style: {color: 'red'}},
        internalHandle,
      );

      expect(hidden.props.style.display).toBe('none');
      expect(hidden._nativeFamily).toBe(instance._nativeFamily);
    });
  });

  describe('cloneHiddenTextInstance', () => {
    it('clones with empty text', () => {
      const instance = HostConfig.createTextInstance(
        'hello',
        rootContainer,
        defaultContext,
        internalHandle,
      );

      const hidden = HostConfig.cloneHiddenTextInstance(
        instance,
        'hello',
        internalHandle,
      );

      expect(hidden.text).toBe('');
      expect(hidden._nativeFamily).toBe(instance._nativeFamily);
    });
  });

  // -------------------------------------------------------------------
  // Container child set
  // -------------------------------------------------------------------
  describe('container child set', () => {
    it('createContainerChildSet returns empty array', () => {
      expect(HostConfig.createContainerChildSet()).toEqual([]);
    });

    it('appendChildToContainerChildSet pushes child', () => {
      const childSet = HostConfig.createContainerChildSet();
      const child = {_nativeNode: {}};
      HostConfig.appendChildToContainerChildSet(childSet, child);
      expect(childSet).toEqual([child]);
    });
  });

  // -------------------------------------------------------------------
  // No JS-side defaults merging
  // -------------------------------------------------------------------
  describe('no JS-side defaults merging', () => {
    beforeEach(() => {
      mockCreateNode.mockClear();
      mockCloneNodeWithNewProps.mockClear();
    });

    it('passes style to $$createNode unchanged', () => {
      const props = {style: {backgroundColor: 'red'}};
      HostConfig.createInstance(
        'div',
        props,
        rootContainer,
        defaultContext,
        internalHandle,
      );

      // The style dict should be passed through as-is — no flexDirection
      // injected by JS. Native handles defaults merging.
      const passedProps = mockCreateNode.mock.calls[0][2];
      expect(passedProps.style).toEqual({backgroundColor: 'red'});
      expect(passedProps.style.flexDirection).toBeUndefined();
    });

    it('strips children from props before passing to native', () => {
      const props = {children: 'text content', style: {color: 'blue'}};
      HostConfig.createInstance(
        'p',
        props,
        rootContainer,
        defaultContext,
        internalHandle,
      );

      const passedProps = mockCreateNode.mock.calls[0][2];
      expect(passedProps.children).toBeUndefined();
      expect(passedProps.style).toEqual({color: 'blue'});
    });

    it('passes element type for native defaults resolution', () => {
      HostConfig.createInstance(
        'h1',
        {style: {}},
        rootContainer,
        defaultContext,
        internalHandle,
      );

      // First arg to $$createNode is the element type
      expect(mockCreateNode.mock.calls[0][0]).toBe('h1');
      // Style should not contain fontSize or fontWeight — native adds those
      const passedProps = mockCreateNode.mock.calls[0][2];
      expect(passedProps.style.fontSize).toBeUndefined();
      expect(passedProps.style.fontWeight).toBeUndefined();
    });

    it('cloneInstance passes new props unchanged', () => {
      const instance = HostConfig.createInstance(
        'div',
        {},
        rootContainer,
        defaultContext,
        internalHandle,
      );

      const newProps = {style: {backgroundColor: 'blue'}};
      HostConfig.cloneInstance(
        instance,
        'div',
        {},
        newProps,
        true,
        null,
      );

      // $$cloneNodeWithNewProps receives the props without JS-side merging
      const passedProps = mockCloneNodeWithNewProps.mock.calls[0][1];
      expect(passedProps.style).toEqual({backgroundColor: 'blue'});
      expect(passedProps.style.flexDirection).toBeUndefined();
    });
  });
});

describe('Hydration host config', () => {
  const defaultContext = {isInsideTextContext: false};

  it('supportsHydration is true', () => {
    expect(HostConfig.supportsHydration).toBe(true);
  });

  describe('getFirstHydratableChildWithinContainer', () => {
    it('calls $$getFirstSSRChild with surfaceId', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      mockGetFirstSSRChild.mockReturnValue(ssrNode);
      const result = HostConfig.getFirstHydratableChildWithinContainer({surfaceId: 1});
      expect(mockGetFirstSSRChild).toHaveBeenCalledWith(1);
      expect(result).toBe(ssrNode);
    });

    it('returns null when no SSR children', () => {
      mockGetFirstSSRChild.mockReturnValue(null);
      const result = HostConfig.getFirstHydratableChildWithinContainer({surfaceId: 1});
      expect(result).toBeNull();
    });
  });

  describe('getFirstHydratableChild', () => {
    it('calls $$getSSRChildOf with node ref', () => {
      const child = {_ssrNodeRef: 2, type: 'p'};
      mockGetSSRChildOf.mockReturnValue(child);
      const result = HostConfig.getFirstHydratableChild({_ssrNodeRef: 1});
      expect(mockGetSSRChildOf).toHaveBeenCalledWith(1);
      expect(result).toBe(child);
    });
  });

  describe('getNextHydratableSibling', () => {
    it('calls $$getNextSSRSibling with node ref', () => {
      const sibling = {_ssrNodeRef: 3, type: 'span'};
      mockGetNextSSRSibling.mockReturnValue(sibling);
      const result = HostConfig.getNextHydratableSibling({_ssrNodeRef: 2});
      expect(mockGetNextSSRSibling).toHaveBeenCalledWith(2);
      expect(result).toBe(sibling);
    });

    it('returns null at end of sibling list', () => {
      mockGetNextSSRSibling.mockReturnValue(null);
      const result = HostConfig.getNextHydratableSibling({_ssrNodeRef: 2});
      expect(result).toBeNull();
    });
  });

  describe('canHydrateInstance', () => {
    it('returns ssrNode when type matches', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateInstance(ssrNode, 'div', {});
      expect(result).toBe(ssrNode);
    });

    it('returns null when type does not match', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateInstance(ssrNode, 'span', {});
      expect(result).toBeNull();
    });

    it('returns null for text nodes', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#text'};
      const result = HostConfig.canHydrateInstance(ssrNode, 'div', {});
      expect(result).toBeNull();
    });
  });

  describe('canHydrateTextInstance', () => {
    it('returns ssrNode when it is a text node', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#text', text: 'hello'};
      const result = HostConfig.canHydrateTextInstance(ssrNode, 'hello');
      expect(result).toBe(ssrNode);
    });

    it('returns null when not a text node', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateTextInstance(ssrNode, 'hello');
      expect(result).toBeNull();
    });
  });

  describe('hydrateInstance', () => {
    it('returns null (no diff warnings)', () => {
      const ssrNode = {_ssrNodeRef: 42, _ssrFamily: 42, type: 'div'};
      const props = {style: {color: 'red'}};
      const handle = {};
      const result = HostConfig.hydrateInstance(
        ssrNode, 'div', props, defaultContext, handle
      );
      expect(result).toBe(true);
    });
  });

  describe('hydrateTextInstance', () => {
    it('returns true (hydration succeeded) when text matches', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#text', text: 'hello'};
      const result = HostConfig.hydrateTextInstance(ssrNode, 'hello', {});
      expect(result).toBe(true);
    });
  });

  describe('canHydrateSuspenseInstance', () => {
    it('returns ssrNode when type is #suspense', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#suspense'};
      const result = HostConfig.canHydrateSuspenseInstance(ssrNode);
      expect(result).toBe(ssrNode);
    });

    it('returns null for non-suspense nodes', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateSuspenseInstance(ssrNode);
      expect(result).toBeNull();
    });
  });
});

describe('hydrateRoot', () => {
  let hydrateRoot;

  beforeEach(() => {
    jest.useFakeTimers();
    // Need to clear module cache since HostConfig is already loaded with mocks
    jest.resetModules();
    // Re-register mocks
    global.$$createNode = mockCreateNode;
    global.$$createTextNode = mockCreateTextNode;
    global.$$appendChild = mockAppendChild;
    global.$$cloneNodeWithNewProps = mockCloneNodeWithNewProps;
    global.$$cloneNodeWithNewChildrenAndProps = mockCloneNodeWithNewChildrenAndProps;
    global.$$completeRoot = mockCompleteRoot;
    global.$$getFirstSSRChild = mockGetFirstSSRChild;
    global.$$getSSRChildOf = mockGetSSRChildOf;
    global.$$getNextSSRSibling = mockGetNextSSRSibling;
    global.$$setInstanceHandle = mockSetInstanceHandle;
    global.$$registerEventHandler = jest.fn();
    hydrateRoot = require('../renderer').hydrateRoot;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is exported from renderer', () => {
    expect(typeof hydrateRoot).toBe('function');
  });

  it('returns object with render and unmount methods', () => {
    const root = hydrateRoot(
      {surfaceId: 1, width: 390, height: 844},
      null,
    );
    expect(typeof root.render).toBe('function');
    expect(typeof root.unmount).toBe('function');
    root.unmount();
  });
});
