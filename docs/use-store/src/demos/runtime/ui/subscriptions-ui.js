// The conditional subscription panel: a component that reads stores
// conditionally, and each store's records and readers, read from the store's
// internals in the frame after every change.

import Check from '../subscriptions-check';
import {el, button, replace, runner, errorBox} from './dom';
import {createFrame, methods} from './frame';

const storeNames = ['theme', 'cart', 'user'];

export function mountSubscriptions(root, context) {
  const frame = createFrame({
    name: 'subscriptions',
    script: 'subscriptions',
    bundle: 'step',
    title: 'Profile and badges, running in React',
    className: 'ex-frame-subs',
    css: context.frameCss,
  });

  const model = Check.createModel();
  const errorSlot = el('div');
  const table = el('div');
  const rendered = el('p', {className: 'ex-small', 'aria-live': 'polite'});
  const run = runner(root, error => replace(errorSlot, errorBox(error)));

  const cartToggle = el('input', {type: 'checkbox', id: context.id('cart')});
  const userToggle = el('input', {type: 'checkbox', id: context.id('user')});
  const badgeCount = el('output', null, '0');

  function show(snapshot, renders) {
    replace(
      table,
      el(
        'table',
        {className: 'ex-counts ex-subs-table'},
        el('caption', null, 'Each store, read from its internals'),
        el(
          'thead',
          null,
          el(
            'tr',
            null,
            el('th', {scope: 'col'}, 'Store'),
            el('th', {scope: 'col'}, 'Value'),
            el('th', {scope: 'col'}, 'Records'),
            el('th', {scope: 'col'}, 'Subscribed components')
          )
        ),
        el(
          'tbody',
          null,
          storeNames.map(name => {
            const info = snapshot.stores[name];
            return el(
              'tr',
              null,
              el('th', {scope: 'row'}, name),
              el('td', null, String(info.value)),
              el('td', null, String(info.records)),
              el(
                'td',
                null,
                info.readers.length === 0 ? 'none' : info.readers.join(', ')
              )
            );
          })
        )
      )
    );
    const names = Object.keys(snapshot.renders);
    rendered.textContent =
      'Rendered: ' +
      (names.length === 0
        ? 'nothing'
        : names.map(n => n + ' ×' + snapshot.renders[n]).join(', ')) +
      '.';
    if (renders) {
      const problems = Check.compare(model, renders, snapshot);
      if (problems.length > 0) {
        replace(errorSlot, errorBox('Unexpected: ' + problems.join('; ')));
      }
    }
  }

  function send(command) {
    return run(async () => {
      const snapshot = await frame.call('run', command);
      const renders = Check.apply(model, command);
      show(snapshot, renders);
    });
  }

  cartToggle.addEventListener('change', () =>
    send({type: 'toggle', store: 'cart', on: cartToggle.checked})
  );
  userToggle.addEventListener('change', () =>
    send({type: 'toggle', store: 'user', on: userToggle.checked})
  );

  function setBadges(delta) {
    const count = Math.max(0, Math.min(3, model.badges + delta));
    if (count === model.badges) {
      return;
    }
    badgeCount.textContent = String(count);
    send({type: 'badges', count});
  }

  function reset() {
    return run(async () => {
      replace(errorSlot);
      Object.assign(model, Check.createModel());
      cartToggle.checked = false;
      userToggle.checked = false;
      badgeCount.textContent = '0';
      const snapshot = await frame.call('reset');
      show(snapshot, null);
    });
  }

  replace(
    root,
    el(
      'div',
      {className: 'ex-panel ex-subs'},
      el(
        'div',
        {className: 'ex-controls'},
        el(
          'div',
          {className: 'ex-control-row'},
          el(
            'label',
            {for: context.id('cart')},
            cartToggle,
            ' Profile reads cart'
          ),
          el(
            'label',
            {for: context.id('user')},
            userToggle,
            ' Profile reads user'
          )
        ),
        el(
          'div',
          {
            className: 'ex-control-row',
            role: 'group',
            'aria-label': 'Badges that read cart',
          },
          el(
            'span',
            {className: 'ex-control-label'},
            'Badges that read cart: '
          ),
          button('−', () => setBadges(-1), {'aria-label': 'Remove a badge'}),
          badgeCount,
          button('+', () => setBadges(1), {'aria-label': 'Add a badge'})
        ),
        el(
          'div',
          {
            className: 'ex-control-row',
            role: 'group',
            'aria-label': 'Update a store',
          },
          el('span', {className: 'ex-control-label'}, 'Update: '),
          storeNames.map(name =>
            button(name, () => send({type: 'update', store: name}), {
              'aria-label': 'Update ' + name,
            })
          ),
          button('Reset', reset)
        )
      ),
      el(
        'div',
        {className: 'ex-grid'},
        el(
          'section',
          {className: 'ex-cell', 'aria-label': 'The components'},
          el('h4', null, 'The components'),
          frame.iframe,
          rendered
        ),
        el(
          'section',
          {className: 'ex-cell ex-wide', 'aria-label': 'Stores'},
          el('h4', null, 'Stores'),
          table
        )
      ),
      errorSlot
    )
  );

  return {
    kind: 'subscriptions',
    frame,
    proxy: methods(frame, ['reset', 'run']),
    start: reset,
  };
}
