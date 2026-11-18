// "Who re-renders": the same list three ways, compiled with the real React
// Compiler when the docs were built. Each panel is its own frame, running
// the development build, and its DevTools hook flashes what rendered.
// Read-only: the code is shown, not edited.

import Check from '../rerenders-check';
import code from '../../../../sandbox/explainers/generated/rerenders-code.json';
import {el, button, replace, runner, errorBox} from './dom';
import {createFrame, methods} from './frame';

const order = ['App', 'List', 'ListView', 'Row', 'RowView'];

function countsTable(renders, selectorCalls, showSelectors) {
  const rows = order.map(name =>
    el(
      'tr',
      {className: renders[name] ? 'ex-hit' : null},
      el('th', {scope: 'row'}, name),
      el('td', null, String(renders[name] || 0))
    )
  );
  if (showSelectors) {
    rows.push(
      el(
        'tr',
        {className: 'ex-selector-row'},
        el('th', {scope: 'row'}, 'selector calls'),
        el('td', null, String(selectorCalls))
      )
    );
  }
  return el(
    'table',
    {className: 'ex-counts'},
    el('caption', null, 'Renders in the last update'),
    el(
      'thead',
      null,
      el(
        'tr',
        null,
        el('th', {scope: 'col'}, 'Component'),
        el('th', {scope: 'col'}, 'Renders')
      )
    ),
    el('tbody', null, rows)
  );
}

function codeBlock(title, text) {
  return el(
    'details',
    {className: 'ex-code'},
    el('summary', null, title),
    el('pre', null, el('code', null, text))
  );
}

export function mountRerenders(root, context) {
  let selected = null;
  const panels = Check.panels.map(info => {
    const frame = createFrame({
      name: 'rerenders',
      script: info.script,
      bundle: 'dev',
      title: info.title + ': the list, running in React',
      className: 'ex-frame-rerenders',
      css: context.frameCss,
    });
    const counts = el(
      'div',
      null,
      countsTable({}, 0, info.panel === 'selectors')
    );
    const source = code[info.panel === 'selectors' ? 'selectors' : 'stores'];
    const panel = el(
      'section',
      {className: 'ex-cell ex-rr-col', 'aria-label': info.title},
      el('h4', null, info.title),
      frame.iframe,
      counts,
      codeBlock('Row, as written', source.row),
      info.compiled
        ? codeBlock(
            'Row, as the React Compiler compiled it',
            source.compiledRow
          )
        : null
    );
    return {info, frame, panel, counts};
  });

  const errorSlot = el('div');
  const status = el('p', {className: 'ex-small', 'aria-live': 'polite'});
  const run = runner(root, error => replace(errorSlot, errorBox(error)));

  async function command(cmd) {
    const before = selected;
    const results = await Promise.all(
      panels.map(p => p.frame.call('run', cmd))
    );
    results.forEach((snapshot, i) => {
      const p = panels[i];
      replace(
        p.counts,
        countsTable(
          snapshot.renders,
          snapshot.selectorCalls,
          p.info.panel === 'selectors'
        )
      );
      const problems = Check.checkSnapshot(
        p.info.panel,
        cmd,
        before,
        snapshot
      ).filter(
        // Flash reporting is checked by G4; the panel only flags render
        // counts it didn't expect.
        problem => !/frame hook|flashes/.test(problem)
      );
      if (problems.length > 0) {
        replace(errorSlot, errorBox(problems.join('; ')));
      }
    });
    if (cmd.type === 'select') {
      selected = cmd.id;
    }
    status.textContent =
      (cmd.type === 'select' ? 'Selected ' : 'Edited ') +
      'row ' +
      cmd.id.slice(1) +
      '.';
  }

  function selectNext() {
    return run(async () => {
      const index =
        selected === null ? 0 : Number(selected.slice(1)) % Check.ROWS;
      await command({type: 'select', id: 'r' + (index + 1)});
    });
  }

  function edit() {
    return run(() => command({type: 'edit', id: 'r2'}));
  }

  function reset() {
    return run(async () => {
      replace(errorSlot);
      selected = null;
      await Promise.all(panels.map(p => p.frame.call('reset')));
      panels.forEach(p =>
        replace(p.counts, countsTable({}, 0, p.info.panel === 'selectors'))
      );
      status.textContent = '';
    });
  }

  replace(
    root,
    el(
      'div',
      {className: 'ex-panel ex-rerenders'},
      el(
        'div',
        {className: 'ex-controls'},
        el(
          'div',
          {className: 'ex-control-row'},
          button('Select the next row', selectNext, {className: 'ex-primary'}),
          button('Edit row 2', edit),
          button('Reset', reset)
        ),
        status
      ),
      el(
        'div',
        {className: 'ex-columns'},
        panels.map(p => p.panel)
      ),
      errorSlot,
      el(
        'p',
        {className: 'ex-footnote'},
        'Each update runs in flushSync, like the benchmarks. The components were compiled with the React Compiler build the benchmarks use, when these docs were built (' +
          code.compiler +
          ').'
      )
    )
  );

  return {
    kind: 'rerenders',
    panels: panels.map(p => ({
      panel: p.info.panel,
      frame: p.frame,
      proxy: methods(p.frame, ['reset', 'run']),
    })),
    start: reset,
  };
}
