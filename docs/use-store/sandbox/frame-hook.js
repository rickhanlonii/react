/* eslint-disable strict -- a browser script for the use(store) docs, not React source. */
// A stub React DevTools hook for sandbox frames. It must load before React,
// which looks for the hook when react-dom initializes.
//
// On every commit it finds the components that rendered, the way React
// DevTools' "highlight updates" does, then:
//   - counts renders per component name (window.__renders),
//   - outlines each rendered component's nearest DOM nodes,
//   - tells frame.js (window.__onSandboxCommit) so it can report to the host.
//
// See API.md, "Render counts and flashing".
(function () {
  'use strict';

  // Work tags and flags, from react-reconciler/src/ReactWorkTags.js and
  // ReactFiberFlags.js.
  const FunctionComponent = 0;
  const ClassComponent = 1;
  const HostPortal = 4;
  const HostComponent = 5;
  const HostText = 6;
  const ContextConsumer = 9;
  const ForwardRef = 11;
  const MemoComponent = 14;
  const SimpleMemoComponent = 15;
  const HostHoistable = 26;
  const HostSingleton = 27;
  const PerformedWork = 1;

  let counts = Object.create(null);
  const listeners = [];
  let nextRendererID = 1;

  function isComponent(fiber) {
    switch (fiber.tag) {
      case FunctionComponent:
      case ClassComponent:
      case ContextConsumer:
      case ForwardRef:
      case MemoComponent:
      case SimpleMemoComponent:
        return true;
      default:
        return false;
    }
  }

  function isHost(fiber) {
    return (
      fiber.tag === HostComponent ||
      fiber.tag === HostHoistable ||
      fiber.tag === HostSingleton
    );
  }

  function getName(fiber) {
    let type = fiber.type;
    if (type == null) {
      return 'Anonymous';
    }
    if (fiber.tag === MemoComponent) {
      type = type.type || type;
    }
    if (fiber.tag === ForwardRef && type.render) {
      return (
        type.displayName ||
        type.render.displayName ||
        type.render.name ||
        'ForwardRef'
      );
    }
    if (fiber.tag === ContextConsumer) {
      return 'Context.Consumer';
    }
    return type.displayName || type.name || 'Anonymous';
  }

  // didFiberRender from react-devtools-shared/src/backend/fiber/shared/
  // DevToolsFiberChangeDetection.js, for the component types. For types that
  // run user code, React sets PerformedWork when the function ran and didn't
  // bail out.
  function didFiberRender(prevFiber, nextFiber) {
    return (nextFiber.flags & PerformedWork) === PerformedWork;
  }

  // Walks the committed tree next to the previous one, like DevTools'
  // updateFiberRecursively. prev is null for a subtree that mounted. If a
  // fiber's child pointer didn't change, React didn't clone its children, so
  // nothing below it rendered.
  function collect(next, prev, out) {
    if (isComponent(next)) {
      if (prev === null || (prev !== next && didFiberRender(prev, next))) {
        out.push(next);
      }
    }
    if (prev !== null && next.child === prev.child) {
      return;
    }
    let child = next.child;
    while (child !== null) {
      collect(child, prev === null ? null : child.alternate, out);
      child = child.sibling;
    }
  }

  // The nearest host nodes of a component, like DevTools' tracing of the
  // nearest host component descendants.
  function hostNodes(fiber, out) {
    let child = fiber.child;
    while (child !== null) {
      if (isHost(child) || child.tag === HostText) {
        let node = child.stateNode;
        if (child.tag === HostText) {
          node = node && node.parentNode;
        }
        if (
          node &&
          node.nodeType === 1 &&
          (flashScope === null || flashScope.contains(node)) &&
          out.indexOf(node) === -1
        ) {
          out.push(node);
        }
      } else if (child.tag !== HostPortal) {
        hostNodes(child, out);
      }
      child = child.sibling;
    }
    return out;
  }

  // ---------------------------------------------------------------- flash

  let flashEnabled = true;
  // Only outline nodes inside this element (null: the whole document).
  let flashScope = null;
  let layer = null;
  let pending = null;
  const MAX_BOXES = 200;

  function reducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function flash(rendered) {
    if (!flashEnabled || rendered.length === 0) {
      return;
    }
    if (pending === null) {
      pending = [];
      requestAnimationFrame(drawFlash);
    }
    for (let i = 0; i < rendered.length; i++) {
      pending.push(rendered[i]);
    }
  }

  function drawFlash() {
    const fibers = pending;
    pending = null;
    if (!document.body) {
      return;
    }
    if (layer === null) {
      layer = document.createElement('div');
      layer.className = '__sandbox-flash-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    // One box per DOM node, labeled with the components that rendered it.
    const boxes = [];
    for (let i = 0; i < fibers.length && boxes.length < MAX_BOXES; i++) {
      const name = getName(fibers[i]);
      const nodes = hostNodes(fibers[i], []);
      for (let j = 0; j < nodes.length; j++) {
        let box = null;
        for (let k = 0; k < boxes.length; k++) {
          if (boxes[k].node === nodes[j]) {
            box = boxes[k];
          }
        }
        if (box === null) {
          box = {node: nodes[j], names: []};
          boxes.push(box);
        }
        if (box.names.indexOf(name) === -1) {
          box.names.push(name);
        }
      }
    }
    const still = reducedMotion();
    for (let b = 0; b < boxes.length; b++) {
      const rect = boxes[b].node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      const el = document.createElement('div');
      el.className =
        '__sandbox-flash' + (still ? ' __sandbox-flash-still' : '');
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      const label = document.createElement('span');
      label.className = '__sandbox-flash-label';
      // The name says what rendered; the render strip has the counts.
      label.textContent = boxes[b].names.join(', ');
      el.appendChild(label);
      layer.appendChild(el);
      scheduleRemoval(el, still);
    }
  }

  function scheduleRemoval(el, still) {
    // The fade is a CSS transition; with reduced motion the outline stays
    // still for a second and then goes.
    setTimeout(
      function () {
        if (still) {
          el.remove();
          return;
        }
        el.classList.add('__sandbox-flash-out');
        setTimeout(function () {
          el.remove();
        }, 500);
      },
      still ? 1000 : 300
    );
  }

  // ---------------------------------------------------------------- hook

  function onCommitFiberRoot(rendererID, root) {
    const current = root.current;
    const rendered = [];
    collect(current, current.alternate, rendered);
    const last = [];
    for (let i = 0; i < rendered.length; i++) {
      const name = getName(rendered[i]);
      counts[name] = (counts[name] || 0) + 1;
      if (last.indexOf(name) === -1) {
        last.push(name);
      }
    }
    flash(rendered);
    for (let l = 0; l < listeners.length; l++) {
      listeners[l](root, last, rendered);
    }
  }

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    // react-dom checks these two when it initializes.
    supportsFiber: true,
    renderers: new Map(),
    inject: function (internals) {
      const id = nextRendererID++;
      this.renderers.set(id, internals);
      return id;
    },
    onScheduleFiberRoot: function () {},
    onCommitFiberRoot: function (rendererID, root) {
      try {
        onCommitFiberRoot(rendererID, root);
      } catch (error) {
        // Never break the app. Report it, so a broken port is visible.
        if (window.__onSandboxHookError) {
          window.__onSandboxHookError(error);
        }
      }
    },
    onCommitFiberUnmount: function () {},
    onPostCommitFiberRoot: function () {},
  };

  window.__renders = {
    counts: function () {
      const copy = {};
      for (const name in counts) {
        copy[name] = counts[name];
      }
      return copy;
    },
    reset: function () {
      counts = Object.create(null);
    },
    onCommit: function (listener) {
      listeners.push(listener);
    },
    setFlash: function (enabled) {
      flashEnabled = enabled;
    },
    setFlashScope: function (element) {
      flashScope = element || null;
    },
    // For tests of the port itself.
    _collect: collect,
    _getName: getName,
  };
})();
