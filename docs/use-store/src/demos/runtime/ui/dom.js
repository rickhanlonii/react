// Small DOM helpers for the explainers' UI.

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props != null) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value == null || value === false) {
        continue;
      }
      if (key === 'className') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key.startsWith('on')) {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false) {
      continue;
    }
    if (Array.isArray(child)) {
      append(node, child);
    } else if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
}

export function clear(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function replace(node, ...children) {
  clear(node);
  append(node, children);
}

export function button(label, onClick, props) {
  return el('button', Object.assign({type: 'button', onClick}, props), label);
}

// Disables a group of controls while an async command runs, so commands
// never overlap, and reports errors in the explainer.
export function runner(root, onError) {
  let busy = false;
  return async function run(task) {
    if (busy) {
      return;
    }
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
    }
  };
}

export function errorBox(error) {
  return el(
    'div',
    {className: 'ex-error', role: 'alert'},
    el('strong', null, 'This explainer failed. '),
    String(error && error.message ? error.message : error)
  );
}
