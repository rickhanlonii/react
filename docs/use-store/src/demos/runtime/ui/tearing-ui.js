// The tearing demo: the same time-sliced render with three sources side by
// side, stepped in lockstep, with the source changed in the middle of the
// render. Each column is its own frame, running the real React build.

import Check from '../tearing-check';
import {el, button, replace, runner, errorBox} from './dom';
import {createFrame, methods} from './frame';

const sources = [
  {source: 'global', title: 'A mutable global', code: 'source.value'},
  {
    source: 'uses',
    title: 'useSyncExternalStore',
    code: 'useSyncExternalStore(subscribe, getSnapshot)',
  },
  {
    source: 'store',
    title: 'use(store), changed in a message event',
    code: 'use(store)',
  },
  {
    source: 'store-click',
    title: 'use(store), changed in a click',
    code: 'use(store)',
  },
];

const changeCode = {
  global: 'source.value++',
  uses: 'external.set(value + 1)',
  store: 'store.update(v => v + 1)',
  'store-click': 'onClick: store.update(v => v + 1)',
};

function allEqual(values) {
  return Check.allEqual(values);
}

export function mountTearing(root, context) {
  const columns = sources.map(info => {
    const frame = createFrame({
      name: 'tearing',
      script: 'tearing',
      bundle: 'step',
      options: {source: info.source},
      title: 'Cells that read ' + info.title + ', running in React',
      className: 'ex-frame-tearing',
      css: context.frameCss,
    });
    const progress = el('ol', {
      className: 'ex-cells',
      'aria-label': 'Render in progress',
    });
    const events = el('ol', {className: 'ex-events'});
    const verdict = el('p', {className: 'ex-verdict', 'aria-live': 'polite'});
    const column = el(
      'section',
      {className: 'ex-cell ex-tear-col', 'aria-label': info.title},
      el('h4', null, info.title),
      el('code', {className: 'ex-code-inline'}, info.code),
      el('p', {className: 'ex-sub'}, 'On screen:'),
      frame.iframe,
      el('p', {className: 'ex-sub'}, 'This render so far:'),
      progress,
      el('p', {className: 'ex-sub'}, 'What happened:'),
      events,
      verdict
    );
    return {
      info,
      frame,
      column,
      progress,
      events,
      verdict,
      snapshots: [],
      cells: [],
    };
  });

  const nextButton = button('…', () => next(), {className: 'ex-primary'});
  const runAllButton = button('Run to the end', () => runToEnd());
  const resetButton = button('Reset', () => reset());
  const errorSlot = el('div');
  let position = 0;

  const run = runner(root, error => replace(errorSlot, errorBox(error)));

  function updateButton() {
    if (position < Check.script.length) {
      const item = Check.script[position];
      nextButton.textContent = 'Next: ' + item.label.toLowerCase();
      nextButton.disabled = false;
      runAllButton.disabled = false;
    } else {
      nextButton.textContent = 'Done';
      nextButton.disabled = true;
      runAllButton.disabled = true;
    }
  }

  function describe(entry, source) {
    if (entry.type === 'commit') {
      return el(
        'li',
        {className: allEqual(entry.values) ? 'ex-ok' : 'ex-bad'},
        'Committed ' +
          entry.values.join(' ') +
          (allEqual(entry.values) ? '' : ' (torn)')
      );
    }
    return null;
  }

  function show(column, snapshot, command) {
    column.snapshots.push(snapshot);
    if (command === 'mutate') {
      const renders = snapshot.log.filter(e => e.type === 'render');
      column.events.appendChild(
        el(
          'li',
          null,
          changeCode[column.info.source] +
            (renders.length > 0
              ? ': React rendered ' +
                renders.length +
                ' cells right away, synchronously.'
              : ': nothing rendered.')
        )
      );
    }
    for (const entry of snapshot.log) {
      if (entry.type === 'render') {
        if (entry.command === 'mutate') {
          column.cells = [];
        }
        // A cell that renders again starts a new render pass.
        if (column.cells.some(c => c.cell === entry.cell)) {
          column.cells = [];
        }
        column.cells.push(entry);
      } else {
        const item = describe(entry, column.info.source);
        if (item) {
          column.events.appendChild(item);
        }
        column.cells = [];
      }
    }
    replace(
      column.progress,
      column.cells.map(c =>
        el(
          'li',
          {className: 'ex-cell-chip'},
          'cell ' + (c.cell + 1) + ' read ' + c.value
        )
      )
    );
  }

  function showVerdicts() {
    for (const column of columns) {
      const problems = Check.checkOutcome(
        column.info.source,
        column.snapshots,
        4
      );
      if (problems.length > 0) {
        column.verdict.textContent = 'Unexpected: ' + problems.join('; ');
        column.verdict.className = 'ex-verdict ex-bad';
      } else {
        const facts = Check.observe(column.snapshots);
        column.verdict.textContent =
          column.info.source === 'global'
            ? 'Tore: one commit showed two values.'
            : column.info.source === 'uses'
              ? 'No tearing, but the change forced a synchronous render of ' +
                facts.renderedOnChange +
                ' cells.'
              : facts.storeOrder === 'transition-first'
                ? 'No tearing: the update got the default lane, so the transition kept rendering with the value it started with, then the update rendered.'
                : 'No tearing: the update got the sync lane, so it rendered first and the transition restarted with the new value.';
        column.verdict.className =
          'ex-verdict ' +
          (column.info.source === 'global' ? 'ex-bad' : 'ex-ok');
      }
    }
  }

  async function command(name) {
    const results = await Promise.all(columns.map(c => c.frame.call(name)));
    results.forEach((snapshot, i) => show(columns[i], snapshot, name));
  }

  function next() {
    return run(async () => {
      if (position >= Check.script.length) {
        return;
      }
      await command(Check.script[position].command);
      position++;
      if (position === Check.script.length) {
        await command('finish');
        showVerdicts();
      }
      updateButton();
    });
  }

  function runToEnd() {
    return run(async () => {
      while (position < Check.script.length) {
        await command(Check.script[position].command);
        position++;
      }
      await command('finish');
      showVerdicts();
      updateButton();
    });
  }

  function reset() {
    return run(async () => {
      replace(errorSlot);
      position = 0;
      const results = await Promise.all(
        columns.map(c => c.frame.call('reset'))
      );
      results.forEach((snapshot, i) => {
        const column = columns[i];
        column.snapshots = [snapshot];
        column.cells = [];
        replace(column.events);
        replace(column.progress);
        column.verdict.textContent = '';
      });
      updateButton();
    });
  }

  replace(
    root,
    el(
      'div',
      {className: 'ex-panel ex-tearing'},
      el(
        'div',
        {className: 'ex-controls'},
        el(
          'div',
          {className: 'ex-control-row'},
          nextButton,
          runAllButton,
          resetButton
        ),
        el(
          'p',
          {className: 'ex-small'},
          'The script: start a transition that re-renders four cells, render two of them, change the source, then let React finish. The last two columns change the same store, from a message event (default lane) and from a click (sync lane).'
        )
      ),
      el(
        'div',
        {className: 'ex-columns ex-columns-4'},
        columns.map(c => c.column)
      ),
      errorSlot,
      el(
        'p',
        {className: 'ex-footnote'},
        'Stepped for illustration: each column runs React with a mock scheduler in its own frame, and every step renders one cell.'
      )
    )
  );

  return {
    kind: 'tearing',
    columns: columns.map(c => ({
      source: c.info.source,
      frame: c.frame,
      proxy: methods(c.frame, ['reset', 'start', 'step', 'mutate', 'finish']),
    })),
    start: reset,
  };
}
