/* eslint-disable strict, react-internal/safe-string-coercion,
   react-internal/no-primitive-constructors, react-internal/warning-args,
   react-internal/no-production-logging --
   a browser script for the use(store) docs, not React source. */
// Turns every div.sandbox on the page into a live sandbox: a code view with
// Edit, Run and Reset, a preview iframe running the real React build, an
// error overlay, a render strip, a console panel, an optional store panel and
// an optional stepper toolbar. Iframes are created when a sandbox scrolls near
// the viewport. The page and the iframes only talk through postMessage.
// See API.md.
(function () {
  'use strict';

  const hostScript = document.currentScript;
  const hostURL = hostScript
    ? hostScript.src
    : new URL('sandbox/host.js', document.baseURI).href;
  const sandboxDir = new URL('./', hostURL).href;
  const vendorDir = new URL('../vendor/', hostURL).href;

  const sandboxes = [];
  const byId = Object.create(null);
  let pageBuild = null;

  // ---------------------------------------------------------------- utils

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const key in attrs) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === 'className') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key.slice(0, 2) === 'on')
          el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
      }
    }
    if (children) {
      for (let i = 0; i < children.length; i++) {
        if (children[i] != null) el.appendChild(children[i]);
      }
    }
    return el;
  }

  function escapeHTML(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function words(value) {
    return value ? value.split(/\s+/).filter(Boolean) : [];
  }

  // A small highlighter, enough for the sandbox code.
  const KEYWORDS = new Set(
    (
      'const let let function return if else for while new null undefined true ' +
      'false import from export default async await try catch finally throw ' +
      'typeof switch case break of in class extends'
    ).split(' ')
  );
  const TOKEN =
    /(\/\/.*$|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(<\/?[A-Za-z][\w.]*|\/?>)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b/gm;

  function highlight(code) {
    let out = '';
    let last = 0;
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(code)) !== null) {
      out += escapeHTML(code.slice(last, m.index));
      const text = m[0];
      if (m[1]) out += '<span class="tc">' + escapeHTML(text) + '</span>';
      else if (m[2]) out += '<span class="ts">' + escapeHTML(text) + '</span>';
      else if (m[3]) out += '<span class="tt">' + escapeHTML(text) + '</span>';
      else if (m[4]) out += '<span class="tn">' + text + '</span>';
      else if (KEYWORDS.has(text))
        out += '<span class="tk">' + text + '</span>';
      else if (text === 'use' || text === 'update' || text === 'createStore')
        out += '<span class="th">' + text + '</span>';
      else out += escapeHTML(text);
      last = m.index + text.length;
    }
    return out + escapeHTML(code.slice(last));
  }

  function dedent(text) {
    const lines = text
      .replace(/^\s*\n/, '')
      .replace(/\s+$/, '')
      .split('\n');
    let indent = Infinity;
    lines.forEach(function (line) {
      if (line.trim()) indent = Math.min(indent, line.match(/^ */)[0].length);
    });
    if (!isFinite(indent)) indent = 0;
    return lines
      .map(function (line) {
        return line.slice(indent);
      })
      .join('\n');
  }

  // ---------------------------------------------------------------- sucrase

  let sucrasePromise = null;

  function loadSucrase() {
    if (sucrasePromise === null) {
      sucrasePromise = new Promise(function (resolve, reject) {
        if (window.sucrase) {
          resolve(window.sucrase);
          return;
        }
        const s = document.createElement('script');
        s.src = vendorDir + 'sucrase.js';
        s.onload = function () {
          resolve(window.sucrase);
        };
        s.onerror = function () {
          reject(new Error('Could not load ' + s.src));
        };
        document.head.appendChild(s);
      });
    }
    return sucrasePromise;
  }

  function compile(code, id) {
    return loadSucrase().then(function (sucrase) {
      return sucrase.transform(code, {
        transforms: ['jsx', 'imports'],
        jsxRuntime: 'automatic',
        production: true,
        filePath: id + '.jsx',
      }).code;
    });
  }

  // ---------------------------------------------------------------- theme

  function colorScheme(el) {
    const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
    if (!m) return 'light';
    const luminance = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    return luminance > 0.5 ? 'dark' : 'light';
  }

  // ---------------------------------------------------------------- sandbox

  const PHASES = {
    compile: 'Compile error',
    module: 'Error while running the module',
    uncaught: 'Uncaught error',
    event: 'Uncaught error',
    promise: 'Unhandled promise rejection',
    hook: 'Sandbox error (render tracking)',
  };

  function Sandbox(el) {
    this.el = el;
    this.id = el.id;
    const data = el.dataset;
    const codeScript = el.querySelector('script[type="text/plain"]');
    this.original = codeScript
      ? dedent(
          codeScript.textContent
            .replace(/<\\\/script/gi, '</script')
            .replace(/<\\!--/g, '<!--')
        )
      : '';
    this.code = this.original;
    this.title = data.title || '';
    this.stepper = data.stepper !== undefined;
    this.stepperButtons = this.stepper
      ? words(data.stepper).length > 0
        ? words(data.stepper)
        : ['paint', 'flush']
      : [];
    this.server = data.server !== undefined;
    this.readonly = data.readonly !== undefined || data.compile !== undefined;
    this.autorun = data.autorun !== 'false';
    this.flash = data.flash !== 'false';
    this.strict = data.strict !== undefined && data.strict !== 'false';
    this.height =
      data.height && data.height !== 'auto' ? Number(data.height) : null;
    this.panels = data.panels ? words(data.panels) : ['console', 'renders'];
    this.scripts = words(data.scripts).map(function (src) {
      return new URL(src, document.baseURI).href;
    });
    this.styles = words(data.styles).map(function (src) {
      return new URL(src, document.baseURI).href;
    });

    this.started = false;
    this.iframe = null;
    this.window = null;
    this.generation = 0;
    this.editing = false;
    this.reqId = 0;
    this.requests = Object.create(null);
    this.resetState();
    this.ranPromise = null;
    this.ranResolve = null;
    this.render();
  }

  Sandbox.prototype.resetState = function () {
    this.consoleEntries = [];
    this.errors = [];
    this.counts = {};
    this.last = [];
    this.stores = [];
    this.stepState = {pending: false, log: []};
    this.build = null;
  };

  Sandbox.prototype.render = function () {
    const self = this;
    const label = this.title || 'Sandbox ' + this.id;
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', label);

    this.editButton = this.readonly
      ? null
      : h('button', {
          type: 'button',
          className: 'sb-btn',
          'aria-pressed': 'false',
          text: 'Edit',
          onclick: function () {
            self.toggleEdit();
          },
        });
    this.runButton = h('button', {
      type: 'button',
      className: 'sb-btn sb-run',
      text: 'Run',
      onclick: function () {
        self.run();
      },
    });
    this.resetButton = h('button', {
      type: 'button',
      className: 'sb-btn',
      text: 'Reset',
      onclick: function () {
        self.reset();
      },
    });
    this.strictBox = h('input', {
      type: 'checkbox',
      className: 'sb-strict',
      checked: this.strict,
      onchange: function () {
        self.strict = self.strictBox.checked;
        self.updateFooter();
        if (self.started) self.start();
      },
    });
    const toolbar = h('div', {className: 'sb-toolbar'}, [
      this.editButton,
      this.runButton,
      this.resetButton,
      h('label', {className: 'sb-check'}, [
        this.strictBox,
        h('span', {text: 'StrictMode'}),
      ]),
    ]);
    const head = h('div', {className: 'sb-head'}, [
      h('div', {className: 'sb-title', text: this.title}),
      toolbar,
    ]);

    this.pre = h('pre', {
      className: 'sb-code',
      tabindex: '0',
      'aria-label': 'Code: ' + label,
    });
    this.pre.innerHTML = highlight(this.code);
    this.textarea = h('textarea', {
      className: 'sb-editor',
      spellcheck: 'false',
      'aria-label': 'Edit code: ' + label,
      hidden: true,
      onkeydown: function (event) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          self.run();
        } else if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          const ta = self.textarea;
          const start = ta.selectionStart;
          ta.setRangeText('  ', start, ta.selectionEnd, 'end');
        }
      },
    });

    this.preview = h('div', {className: 'sb-preview'});
    if (this.height !== null) this.preview.style.height = this.height + 'px';
    this.placeholder = h('button', {
      type: 'button',
      className: 'sb-placeholder',
      text: 'Run this sandbox',
      onclick: function () {
        self.start();
      },
    });
    this.preview.appendChild(this.placeholder);
    this.overlay = h('div', {
      className: 'sb-overlay',
      role: 'alert',
      hidden: true,
    });
    this.preview.appendChild(this.overlay);

    this.stepperBar = null;
    if (this.stepper) {
      const buttons = this.stepperButtons.map(function (cmd) {
        const text = {
          paint: 'Next commit',
          flush: 'Flush all',
          yield: 'Next yield',
        }[cmd];
        if (!text) return null;
        return h('button', {
          type: 'button',
          className: 'sb-btn',
          text: text,
          'data-step': cmd,
          onclick: function () {
            self.step(cmd);
          },
        });
      });
      this.pendingEl = h('span', {
        className: 'sb-pending',
        'aria-live': 'polite',
      });
      this.stepLogEl = h('span', {className: 'sb-steplog'});
      this.stepperBar = h(
        'div',
        {className: 'sb-stepper', role: 'toolbar', 'aria-label': 'Stepper'},
        buttons.concat([this.pendingEl, this.stepLogEl])
      );
    }

    this.strip = h('div', {
      className: 'sb-strip',
      'aria-label': 'Renders since the last run',
    });
    this.consoleEl = h('div', {
      className: 'sb-console',
      'aria-label': 'Console',
      role: 'log',
    });
    this.storesEl = h('div', {
      className: 'sb-stores',
      'aria-label': 'Store inspector',
      hidden: true,
    });
    this.footer = h('div', {className: 'sb-foot'});

    this.ui = h('div', {className: 'sb-ui'}, [
      head,
      this.pre,
      this.textarea,
      this.stepperBar,
      this.preview,
      this.panels.indexOf('renders') !== -1 ? this.strip : null,
      this.storesEl,
      this.panels.indexOf('console') !== -1 ? this.consoleEl : null,
      this.footer,
    ]);
    this.el.appendChild(this.ui);
    this.updatePanels();
    this.updateFooter();
  };

  Sandbox.prototype.toggleEdit = function (force) {
    this.editing = force === undefined ? !this.editing : force;
    if (this.editing) {
      this.textarea.value = this.code;
      this.textarea.style.height = Math.max(120, this.pre.offsetHeight) + 'px';
      this.textarea.hidden = false;
      this.pre.hidden = true;
      this.textarea.focus();
    } else {
      this.code = this.textarea.value;
      this.pre.innerHTML = highlight(this.code);
      this.textarea.hidden = true;
      this.pre.hidden = false;
    }
    if (this.editButton) {
      this.editButton.setAttribute('aria-pressed', String(this.editing));
      this.editButton.textContent = this.editing ? 'Done' : 'Edit';
    }
  };

  Sandbox.prototype.getCode = function () {
    return this.editing ? this.textarea.value : this.code;
  };

  Sandbox.prototype.setCode = function (code) {
    this.code = code;
    this.textarea.value = code;
    this.pre.innerHTML = highlight(code);
  };

  Sandbox.prototype.run = function (code) {
    if (code !== undefined) this.setCode(code);
    else this.code = this.getCode();
    if (!this.editing) this.pre.innerHTML = highlight(this.code);
    return this.start();
  };

  Sandbox.prototype.reset = function () {
    this.setCode(this.original);
    return this.start();
  };

  Sandbox.prototype.ran = function () {
    return this.ranPromise || this.start();
  };

  // Starts a fresh iframe with the current code. Every run gets a new realm,
  // so module-level stores start over.
  Sandbox.prototype.start = function () {
    const self = this;
    this.started = true;
    const generation = ++this.generation;
    this.resetState();
    this.ranPromise = new Promise(function (resolve) {
      self.ranResolve = resolve;
    });
    this.placeholder.hidden = true;
    this.hideOverlay();
    this.updatePanels();
    if (this.iframe !== null) {
      this.iframe.remove();
      this.iframe = null;
      this.window = null;
    }
    compile(this.code, this.id).then(
      function (compiled) {
        if (generation !== self.generation) return;
        self.compiled = compiled;
        self.createFrame();
      },
      function (error) {
        if (generation !== self.generation) return;
        self.onError({
          phase: 'compile',
          message: (error && error.message) || String(error),
          stack: '',
          componentStack: '',
        });
        self.finishRun(false);
      }
    );
    return this.ranPromise;
  };

  Sandbox.prototype.finishRun = function (ok) {
    if (this.ranResolve) {
      const resolve = this.ranResolve;
      this.ranResolve = null;
      resolve({ok: ok, errors: this.errors.slice()});
    }
  };

  Sandbox.prototype.createFrame = function () {
    const config = {
      id: this.id,
      runtime: this.stepper ? 'step' : 'dev',
      strict: this.strict,
    };
    const scheme = colorScheme(this.el);
    const parts = [
      '<!doctype html><html style="color-scheme:' +
        scheme +
        '"><head><meta charset="utf-8">',
      '<link rel="stylesheet" href="' +
        escapeHTML(sandboxDir + 'frame.css') +
        '">',
    ];
    this.styles.forEach(function (href) {
      parts.push('<link rel="stylesheet" href="' + escapeHTML(href) + '">');
    });
    parts.push(
      '<script>window.__SANDBOX__=' +
        JSON.stringify(config).replace(/</g, '\\u003c') +
        '</script>',
      '<script src="' +
        escapeHTML(sandboxDir + 'frame-hook.js') +
        '"></script>',
      '<script src="' +
        escapeHTML(
          vendorDir + (this.stepper ? 'react-step.js' : 'react-dev.js')
        ) +
        '"></script>'
    );
    if (this.server) {
      parts.push(
        '<script src="' +
          escapeHTML(vendorDir + 'react-server-dev.js') +
          '"></script>'
      );
    }
    this.scripts.forEach(function (src) {
      parts.push('<script src="' + escapeHTML(src) + '"></script>');
    });
    parts.push(
      '<script src="' + escapeHTML(sandboxDir + 'frame.js') + '"></script>',
      '</head><body><div id="root"></div></body></html>'
    );
    const iframe = h('iframe', {
      className: 'sb-frame',
      title: 'Preview: ' + (this.title || this.id),
    });
    iframe.srcdoc = parts.join('\n');
    this.preview.insertBefore(iframe, this.overlay);
    this.iframe = iframe;
    this.window = iframe.contentWindow;
    if (this.height === null) iframe.style.height = '80px';
    const self = this;
    const generation = this.generation;
    // A frame that never says ready (a script failed to load) is an error,
    // not a silent blank.
    setTimeout(function () {
      if (generation === self.generation && self.build === null) {
        self.onError({
          phase: 'module',
          message:
            'The sandbox frame did not start. Check that vendor/ and sandbox/ are next to the page.',
          stack: '',
          componentStack: '',
        });
        self.finishRun(false);
      }
    }, 10000);
  };

  Sandbox.prototype.send = function (type, fields) {
    if (!this.window) return;
    const message = fields || {};
    message.__sandbox = 1;
    message.id = this.id;
    message.type = type;
    this.window.postMessage(message, '*');
  };

  Sandbox.prototype.request = function (type, fields) {
    const self = this;
    return this.ran().then(function () {
      return new Promise(function (resolve) {
        const reqId = ++self.reqId;
        self.requests[reqId] = resolve;
        fields = fields || {};
        fields.reqId = reqId;
        self.send(type, fields);
      });
    });
  };

  Sandbox.prototype.step = function (cmd, count) {
    return this.request('step', {cmd: cmd, count: count});
  };

  Sandbox.prototype.inspect = function () {
    return this.request('inspect');
  };

  Sandbox.prototype.resetRenders = function () {
    this.send('reset-renders');
  };

  Sandbox.prototype.clearConsole = function () {
    this.consoleEntries = [];
    this.renderConsole();
  };

  Sandbox.prototype.onMessage = function (message) {
    switch (message.type) {
      case 'ready':
        this.build = message.build;
        if (pageBuild === null) {
          pageBuild = message.build;
          fillBuildLabels();
        }
        this.updateFooter();
        this.send('run', {
          code: this.compiled,
          strict: this.strict,
          flash: this.flash,
        });
        break;
      case 'ran':
        this.finishRun(message.ok);
        break;
      case 'console':
        this.addConsole(message.kind, message.text, message.source);
        break;
      case 'error':
        this.onError(message);
        break;
      case 'commit':
        this.counts = message.counts;
        this.last = message.last;
        this.renderStrip();
        break;
      case 'stores':
        this.stores = message.stores;
        this.renderStores();
        break;
      case 'step-state':
        this.stepState = {pending: message.pending, log: message.log};
        this.renderStepper();
        break;
      case 'size':
        if (this.height === null && this.iframe) {
          this.iframe.style.height =
            Math.max(80, Math.min(600, message.height)) + 'px';
        }
        break;
    }
    if (message.reqId !== undefined && this.requests[message.reqId]) {
      const resolve = this.requests[message.reqId];
      delete this.requests[message.reqId];
      resolve(message);
    }
  };

  // ---------------------------------------------------------------- panels

  Sandbox.prototype.addConsole = function (kind, text, source) {
    const entries = this.consoleEntries;
    const previous = entries[entries.length - 1];
    if (previous && previous.kind === kind && previous.text === text) {
      previous.count++;
    } else {
      entries.push({
        kind: kind,
        text: text,
        source: source || 'console',
        count: 1,
      });
      if (entries.length > 500) entries.shift();
    }
    this.renderConsole();
  };

  Sandbox.prototype.renderConsole = function () {
    const el = this.consoleEl;
    el.textContent = '';
    if (this.consoleEntries.length === 0) {
      el.appendChild(
        h('div', {className: 'sb-empty', text: 'Console: no output'})
      );
      return;
    }
    this.consoleEntries.forEach(function (entry) {
      el.appendChild(
        h('div', {className: 'sb-line sb-' + entry.kind}, [
          h('span', {className: 'sb-kind', text: entry.kind}),
          h('span', {className: 'sb-text', text: entry.text}),
          entry.count > 1
            ? h('span', {className: 'sb-repeat', text: '×' + entry.count})
            : null,
        ])
      );
    });
    el.scrollTop = el.scrollHeight;
  };

  Sandbox.prototype.renderStrip = function () {
    const self = this;
    const el = this.strip;
    el.textContent = '';
    const names = Object.keys(this.counts);
    el.appendChild(h('span', {className: 'sb-strip-label', text: 'Renders'}));
    if (names.length === 0) {
      el.appendChild(h('span', {className: 'sb-empty', text: 'none yet'}));
    }
    names.forEach(function (name) {
      const isLast = self.last.indexOf(name) !== -1;
      el.appendChild(
        h(
          'span',
          {
            className: 'sb-chip' + (isLast ? ' sb-last' : ''),
            title: isLast ? 'Rendered in the last commit' : null,
          },
          [
            isLast
              ? h('span', {
                  className: 'sb-dot',
                  'aria-label': 'last commit',
                  text: '●',
                })
              : null,
            document.createTextNode(name + ' ×' + self.counts[name]),
          ]
        )
      );
    });
    el.appendChild(
      h('button', {
        type: 'button',
        className: 'sb-btn sb-small',
        text: 'Clear counts',
        onclick: function () {
          self.resetRenders();
        },
      })
    );
  };

  function updateList(list) {
    if (list.length === 0) return '(none)';
    return list
      .map(function (u) {
        return u.laneName + ': ' + u.action;
      })
      .join(', ');
  }

  Sandbox.prototype.renderStores = function () {
    const el = this.storesEl;
    el.textContent = '';
    el.hidden = this.stores.length === 0;
    this.stores.forEach(function (store) {
      const box = h('div', {className: 'sb-store'}, [
        h('div', {className: 'sb-store-label', text: store.label}),
      ]);
      if (!store.ok) {
        box.appendChild(
          h('div', {className: 'sb-store-error', text: store.reason})
        );
        el.appendChild(box);
        return;
      }
      const s = store.snapshot;
      // The panel never runs the reducer: headBase is store._head, before the
      // queued updates it hasn't folded in yet.
      const rows = [['store._head', s.headBase]];
      if (s.headQueue.length) {
        rows.push(['not folded in yet', s.headQueue.join(', ')]);
      }
      if (s.heldTransitionUpdates.length) {
        rows.push([
          'held (no reader yet)',
          updateList(s.heldTransitionUpdates),
        ]);
      }
      if (s.records.length === 0) rows.push(['roots', 'none read it']);
      s.records.forEach(function (r, i) {
        const prefix = s.records.length > 1 ? 'root ' + (i + 1) + ' ' : '';
        rows.push([prefix + 'committed', r.committed.memoizedState]);
        if (r.committed.baseState !== r.committed.memoizedState) {
          rows.push([prefix + 'base state', r.committed.baseState]);
        }
        rows.push([prefix + 'pending', updateList(r.pending)]);
        rows.push([prefix + 'base queue', updateList(r.baseQueue)]);
        if (r.committed.skippedLanes.length) {
          rows.push([
            prefix + 'skipped lanes',
            r.committed.skippedLanes.join(', '),
          ]);
        }
        rows.push([
          prefix + 'readers',
          r.readerCount + (r.readers.length ? ': ' + r.readers.join(', ') : ''),
        ]);
      });
      const dl = h('dl', {className: 'sb-store-rows'});
      rows.forEach(function (row) {
        dl.appendChild(h('dt', {text: row[0]}));
        dl.appendChild(h('dd', {text: row[1]}));
      });
      box.appendChild(dl);
      el.appendChild(box);
    });
  };

  Sandbox.prototype.renderStepper = function () {
    if (!this.stepperBar) return;
    const pending = this.stepState.pending;
    this.pendingEl.textContent = pending
      ? '● Pending work'
      : '○ No pending work';
    this.pendingEl.className = 'sb-pending' + (pending ? ' sb-is-pending' : '');
    this.stepLogEl.textContent = this.stepState.log.length
      ? 'Log: ' + this.stepState.log.join(', ')
      : '';
  };

  Sandbox.prototype.updatePanels = function () {
    this.renderConsole();
    this.renderStrip();
    this.renderStores();
    this.renderStepper();
  };

  Sandbox.prototype.updateFooter = function () {
    const b = this.build || pageBuild;
    const parts = [
      b
        ? 'React ' +
          b.version +
          ' (' +
          b.sha.slice(0, 10) +
          (b.dirty ? ', dirty' : '') +
          ')'
        : 'React',
      'development build',
      'no compiler',
      'StrictMode ' + (this.strict ? 'on' : 'off'),
    ];
    if (this.stepper) parts.push('mock scheduler: stepped for illustration');
    if (this.readonly && this.el.dataset.compile)
      parts.push('compiled with the React Compiler at build time');
    this.footer.textContent = parts.join(' · ');
  };

  Sandbox.prototype.onError = function (error) {
    this.errors.push({
      phase: error.phase,
      message: error.message,
      stack: error.stack || '',
      componentStack: error.componentStack || '',
    });
    this.addConsole(
      'error',
      (PHASES[error.phase] || 'Error') + ': ' + error.message,
      'host'
    );
    this.showOverlay();
  };

  Sandbox.prototype.showOverlay = function () {
    const self = this;
    const error = this.errors[this.errors.length - 1];
    const el = this.overlay;
    el.textContent = '';
    let title = PHASES[error.phase] || 'Error';
    if (this.errors.length > 1)
      title += ' (' + this.errors.length + ' errors, showing the last)';
    el.appendChild(h('div', {className: 'sb-overlay-title', text: title}));
    el.appendChild(
      h('pre', {className: 'sb-overlay-message', text: error.message})
    );
    if (error.componentStack) {
      el.appendChild(
        h('pre', {
          className: 'sb-overlay-stack',
          text: error.componentStack.replace(/^\n+/, ''),
        })
      );
    }
    if (error.stack) {
      el.appendChild(
        h('details', null, [
          h('summary', {text: 'Stack'}),
          h('pre', {className: 'sb-overlay-stack', text: error.stack}),
        ])
      );
    }
    el.appendChild(
      h('button', {
        type: 'button',
        className: 'sb-btn',
        text: 'Dismiss',
        onclick: function () {
          self.hideOverlay();
        },
      })
    );
    el.hidden = false;
    this.preview.classList.add('sb-has-error');
  };

  Sandbox.prototype.hideOverlay = function () {
    this.overlay.hidden = true;
    this.preview.classList.remove('sb-has-error');
  };

  Sandbox.prototype.state = function () {
    return JSON.parse(
      JSON.stringify({
        console: this.consoleEntries,
        errors: this.errors,
        counts: this.counts,
        last: this.last,
        stores: this.stores,
        stepper: this.stepState,
        build: this.build,
        overlay: !this.overlay.hidden,
      })
    );
  };

  // The object gates and tests use (API.md, section 4).
  Sandbox.prototype.api = function () {
    const self = this;
    return {
      ran: function () {
        return self.ran();
      },
      run: function (code) {
        return self.run(code);
      },
      reset: function () {
        return self.reset();
      },
      getCode: function () {
        return self.getCode();
      },
      setCode: function (code) {
        self.setCode(code);
      },
      originalCode: function () {
        return self.original;
      },
      state: function () {
        return self.state();
      },
      clearConsole: function () {
        self.clearConsole();
      },
      resetRenders: function () {
        self.resetRenders();
      },
      step: function (cmd, count) {
        return self.step(cmd, count);
      },
      inspect: function () {
        return self.inspect();
      },
      frame: function () {
        return self.iframe;
      },
    };
  };

  // ---------------------------------------------------------------- page

  function fillBuildLabels() {
    const b = pageBuild;
    const text =
      'React ' +
      b.version +
      ' (' +
      b.sha.slice(0, 10) +
      (b.dirty ? ', dirty' : '') +
      ')';
    document.querySelectorAll('[data-sandbox-build]').forEach(function (el) {
      if (!el.textContent.trim()) el.textContent = text;
    });
    sandboxes.forEach(function (sb) {
      sb.updateFooter();
    });
  }

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (!message || message.__sandbox !== 1) return;
    const sb = byId[message.id];
    if (!sb || event.source !== sb.window) return;
    sb.onMessage(message);
  });

  function init() {
    const els = document.querySelectorAll('div.sandbox');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el.id) {
        console.error('A div.sandbox needs an id.', el);
        continue;
      }
      if (byId[el.id]) {
        console.error('Two sandboxes have the id ' + el.id + '.');
        continue;
      }
      const sb = new Sandbox(el);
      sandboxes.push(sb);
      byId[el.id] = sb;
    }
    const autorun = sandboxes.filter(function (sb) {
      return sb.autorun;
    });
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              const sb = byId[entry.target.id];
              if (sb && !sb.started) sb.start();
            }
          });
        },
        {rootMargin: '400px 0px'}
      );
      autorun.forEach(function (sb) {
        observer.observe(sb.el);
      });
    } else {
      autorun.forEach(function (sb) {
        sb.start();
      });
    }
  }

  window.__sandboxHost = {
    list: function () {
      return sandboxes.map(function (sb) {
        return sb.id;
      });
    },
    get: function (id) {
      const sb = byId[id];
      if (!sb) throw new Error('No sandbox with id ' + id);
      return sb.api();
    },
    runAll: function () {
      return Promise.all(
        sandboxes.map(function (sb) {
          return sb.ran().then(function (result) {
            return {id: sb.id, ok: result.ok, errors: result.errors};
          });
        })
      );
    },
    build: function () {
      return pageBuild;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
