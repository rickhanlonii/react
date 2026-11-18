// The interactive explainers. A page embeds one with
//
//   <div class="explainer" data-explainer="queue"></div>
//   <script src="sandbox/explainers/generated/explainers.js"></script>
//
// (see sandbox/explainers/README.md). Each explainer creates its frames when
// it comes near the viewport. window.__explainers is the hook the G4 gate
// (tools/check-explainers.mjs) uses to drive them.

import QueueCheck from './queue-check';
import TearingCheck from './tearing-check';
import RerendersCheck from './rerenders-check';
import SubscriptionsCheck from './subscriptions-check';
import {mountQueue} from './ui/queue-ui';
import {mountTearing} from './ui/tearing-ui';
import {mountRerenders} from './ui/rerenders-ui';
import {mountSubscriptions} from './ui/subscriptions-ui';
import {css, frameCss} from './ui/styles';
import {errorBox, replace} from './ui/dom';

const kinds = {
  queue: mountQueue,
  tearing: mountTearing,
  rerenders: mountRerenders,
  subscriptions: mountSubscriptions,
};

const instances = [];
const started = [];
let nextId = 0;

function injectStyles() {
  if (document.getElementById('explainer-styles') !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'explainer-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function mount(node) {
  if (node.__explainer) {
    return node.__explainer;
  }
  const kind = node.getAttribute('data-explainer');
  const create = kinds[kind];
  if (create === undefined) {
    replace(node, errorBox('Unknown explainer "' + kind + '".'));
    return null;
  }
  const prefix = 'ex' + nextId++ + '-';
  const instance = create(node, {frameCss, id: name => prefix + name});
  instance.node = node;
  node.__explainer = instance;
  instances.push(instance);
  const start = instance.start().catch(error => {
    node.appendChild(errorBox(error));
    throw error;
  });
  started.push(start);
  instance.started = start;
  return instance;
}

function mountAll(eager) {
  injectStyles();
  const nodes = document.querySelectorAll('.explainer[data-explainer]');
  if (eager || typeof IntersectionObserver !== 'function') {
    nodes.forEach(mount);
    return;
  }
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          mount(entry.target);
        }
      }
    },
    {rootMargin: '600px 0px'}
  );
  nodes.forEach(node => {
    if (!node.__explainer) {
      observer.observe(node);
    }
  });
}

function find(kind) {
  mountAll(true);
  const instance = instances.find(i => i.kind === kind);
  if (instance === undefined) {
    throw new Error('No ' + kind + ' explainer on this page.');
  }
  return instance;
}

// The G4 checks, run in the page against the real frames. Each one resets
// its explainer when it's done.
const checks = {
  async queue(options) {
    const instance = find('queue');
    await instance.started;
    const result = await QueueCheck.runSeeds(instance.proxy, options);
    await instance.start();
    return result;
  },
  async tearing() {
    const instance = find('tearing');
    await instance.started;
    const results = {};
    for (const column of instance.columns) {
      const snapshots = await TearingCheck.runScript(column.proxy);
      results[column.source] = {
        problems: TearingCheck.checkOutcome(column.source, snapshots, 4),
        observed: TearingCheck.observe(snapshots),
        snapshots,
      };
    }
    await instance.start();
    return results;
  },
  async rerenders() {
    const instance = find('rerenders');
    await instance.started;
    const frames = {};
    for (const panel of instance.panels) {
      frames[panel.panel] = panel.proxy;
    }
    const problems = await RerendersCheck.runScript(frames);
    await instance.start();
    return {problems};
  },
  async subscriptions(options) {
    const instance = find('subscriptions');
    await instance.started;
    const result = await SubscriptionsCheck.runSeeds(instance.proxy, options);
    await instance.start();
    return result;
  },
};

window.__explainers = {
  instances,
  checks,
  mountAll: () => mountAll(true),
  // Resolves when every explainer on the page has loaded its frames and
  // rendered.
  ready() {
    mountAll(true);
    return Promise.all(started);
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAll(false));
} else {
  mountAll(false);
}
