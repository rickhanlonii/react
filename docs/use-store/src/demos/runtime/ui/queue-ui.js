// The queue and lane visualizer. The reader dispatches updates to a store
// with different priorities and steps renders; the panel shows the root's
// record of the store, read from the real React build in the frame, and the
// renders the preview predicts.

import Preview from '../queue-preview';
import {el, button, replace, runner, errorBox} from './dom';
import {createFrame, methods} from './frame';

function reducer(state, action) {
  return action.op === 'add' ? state + action.n : state * action.n;
}

function opLabel(action) {
  return (action.op === 'add' ? '+' : '×') + action.n;
}

// A short label for a lane. The full name is in the chip's title and in the
// small text under it.
function laneLabel(lane) {
  const name = Preview.laneName(lane);
  if (lane === Preview.NoLane) {
    return 'rebase';
  }
  const match = /^TransitionLane(\d+)$/.exec(name);
  if (match) {
    return 'transition ' + match[1];
  }
  return name.replace(/Lane$/, '').toLowerCase();
}

function chip(update, state) {
  const kind = Preview.laneKind(update.lane);
  return el(
    'li',
    {
      className: 'ex-chip ex-lane-' + kind + (state ? ' ex-chip-' + state : ''),
      title: Preview.laneName(update.lane) + ': ' + opLabel(update.action),
    },
    el('span', {className: 'ex-chip-op'}, opLabel(update.action)),
    el('span', {className: 'ex-chip-lane'}, laneLabel(update.lane))
  );
}

function chips(updates, state, empty) {
  if (updates.length === 0) {
    return el('p', {className: 'ex-empty'}, empty);
  }
  return el(
    'ol',
    {className: 'ex-chips'},
    updates.map(u => chip(u, state))
  );
}

export function toPreviewRecord(snapshot) {
  const record = snapshot.record;
  return {
    baseState: record.baseState,
    queue: record.baseQueue.concat(record.pending, snapshot.inflight),
  };
}

export function mountQueue(root, context) {
  const frame = createFrame({
    name: 'queue',
    script: 'queue',
    bundle: 'step',
    title: 'The component that reads the store, running in React',
    className: 'ex-frame-queue',
    css: context.frameCss,
  });

  const screenValue = el('output', {className: 'ex-big'}, '…');
  const latestValue = el('output', {className: 'ex-big'}, '…');
  const baseState = el('output', null, '…');
  const queueBox = el('div');
  const inflightBox = el('div');
  const readersBox = el('span');
  const upcomingBox = el('div');
  const logBox = el('ol', {className: 'ex-log', 'aria-live': 'polite'});
  const errorSlot = el('div');
  let snapshot = null;

  function log(text) {
    logBox.insertBefore(el('li', null, text), logBox.firstChild);
    while (logBox.childNodes.length > 8) {
      logBox.removeChild(logBox.lastChild);
    }
  }

  function render() {
    const record = snapshot.record;
    const previewRecord = toPreviewRecord(snapshot);
    const preview = Preview.preview(previewRecord, reducer);
    screenValue.textContent = String(record.committedValue);
    latestValue.textContent = String(snapshot.head);
    baseState.textContent = String(record.baseState);
    replace(
      queueBox,
      chips(
        record.baseQueue.concat(record.pending),
        null,
        'Empty: every update has committed.'
      )
    );
    replace(
      inflightBox,
      chips(snapshot.inflight, 'inflight', 'Nothing waiting.')
    );
    readersBox.textContent =
      record.readers.join(', ') + ' (' + record.readerCount + ')';
    if (preview.renders.length === 0) {
      replace(
        upcomingBox,
        el('p', {className: 'ex-empty'}, 'No renders pending.')
      );
    } else {
      replace(
        upcomingBox,
        el(
          'ol',
          {className: 'ex-upcoming'},
          preview.renders.map((r, i) =>
            el(
              'li',
              {className: i === 0 ? 'ex-next' : null},
              el(
                'span',
                {className: 'ex-upcoming-lanes'},
                r.laneNames.join(' + ')
              ),
              ' commits ',
              el('strong', null, String(r.value)),
              i === 0 ? el('span', {className: 'ex-tag'}, 'next step') : null
            )
          )
        )
      );
    }
  }

  const run = runner(root, error => {
    replace(errorSlot, errorBox(error));
  });

  function describeRenders(renders, predicted) {
    if (renders.length === 0) {
      return 'Nothing rendered.';
    }
    const lanes = predicted ? ' (' + predicted.laneNames.join(' + ') + ')' : '';
    return (
      'React rendered' +
      lanes +
      ' and committed ' +
      renders[renders.length - 1] +
      '.'
    );
  }

  // Checks what React did against what the preview said it would do, and
  // says so if they disagree. G4 checks this on random sequences.
  function verify(predicted, next) {
    if (predicted && !Object.is(predicted.value, next.record.committedValue)) {
      replace(
        errorSlot,
        errorBox(
          'The preview said this render would commit ' +
            predicted.value +
            ', but React committed ' +
            next.record.committedValue +
            '.'
        )
      );
    }
  }

  function dispatch(kind, op) {
    return run(async () => {
      const next = await frame.call('dispatch', {kind, ops: [op]});
      const queued =
        next.inflight.length > snapshot.inflight.length
          ? next.inflight[next.inflight.length - 1]
          : null;
      const label = opLabel(op);
      if (kind === 'sync') {
        // flushSync renders the urgent batch before it returns.
        const afterDispatch = Preview.preview(
          {
            baseState: snapshot.record.baseState,
            queue: toPreviewRecord(snapshot).queue.concat([
              {lane: Preview.SyncLane, action: op},
            ]),
          },
          reducer
        ).next;
        log(
          'flushSync(() => store.update(' +
            label +
            ')). ' +
            describeRenders(next.renders, afterDispatch)
        );
        if (next.renders.length > 0) {
          verify(afterDispatch, next);
        }
      } else if (queued === null) {
        log(
          'store.update(' +
            label +
            ") didn't change the value, so React dropped it without scheduling a render."
        );
      } else {
        log(
          (kind === 'transition'
            ? 'startTransition(() => store.update(' + label + '))'
            : 'store.update(' + label + ')') +
            (queued ? ' got ' + queued.laneName + '. ' : '. ') +
            (next.renders.length > 0
              ? 'The event scheduled a transition, so at the end of the event React rendered the pending default-lane updates right away and committed ' +
                next.renders[next.renders.length - 1] +
                '. (Experimental channel only: this comes with the default transition indicator, enableDefaultTransitionIndicator. Stable React waits.)'
              : 'Nothing rendered.')
        );
      }
      snapshot = next;
      render();
    });
  }

  function step() {
    return run(async () => {
      const predicted = Preview.preview(
        toPreviewRecord(snapshot),
        reducer
      ).next;
      const next = await frame.call('step');
      log('Step. ' + describeRenders(next.renders, predicted));
      verify(predicted, next);
      snapshot = next;
      render();
    });
  }

  function reset() {
    return run(async () => {
      replace(errorSlot);
      snapshot = await frame.call('reset', {initial: 1});
      replace(logBox);
      log('Created the store with 1 and rendered it.');
      render();
    });
  }

  const ops = [
    {op: 'add', n: 1},
    {op: 'mul', n: 2},
  ];
  function row(kind, label, note) {
    return el(
      'div',
      {className: 'ex-control-row', role: 'group', 'aria-label': label},
      el('span', {className: 'ex-control-label'}, label),
      ops.map(op =>
        button(opLabel(op), () => dispatch(kind, op), {
          'aria-label': label + ': ' + opLabel(op),
          className: 'ex-lane-btn ex-lane-' + kind,
        })
      ),
      note ? el('span', {className: 'ex-note'}, note) : null
    );
  }

  replace(
    root,
    el(
      'div',
      {className: 'ex-panel ex-queue'},
      el(
        'div',
        {className: 'ex-controls'},
        row('default', 'Default', 'store.update()'),
        row('transition', 'Transition', 'inside startTransition'),
        row('sync', 'Sync', 'inside flushSync: renders right away'),
        el(
          'div',
          {className: 'ex-control-row'},
          button('Step: render the next batch', step, {
            className: 'ex-primary',
          }),
          button('Reset', reset)
        )
      ),
      el(
        'div',
        {className: 'ex-grid'},
        el(
          'section',
          {className: 'ex-cell', 'aria-label': 'On screen'},
          el('h4', null, 'On screen'),
          frame.iframe,
          el('p', {className: 'ex-small'}, 'Committed value: ', screenValue)
        ),
        el(
          'section',
          {className: 'ex-cell', 'aria-label': 'Latest value'},
          el('h4', null, 'Latest value'),
          latestValue,
          el(
            'p',
            {className: 'ex-small'},
            'Every update applied in dispatch order.'
          )
        ),
        el(
          'section',
          {
            className: 'ex-cell ex-wide',
            'aria-label': "The root's record of the store",
          },
          el('h4', null, "The root's record of the store"),
          el('p', null, 'Base state: ', baseState),
          el('p', {className: 'ex-sub'}, 'Queue (committed base queue):'),
          queueBox,
          el(
            'p',
            {className: 'ex-sub'},
            'Dispatched, waiting for the next render to pick them up:'
          ),
          inflightBox,
          el('p', {className: 'ex-small'}, 'Readers: ', readersBox)
        ),
        el(
          'section',
          {className: 'ex-cell ex-wide', 'aria-label': 'Upcoming renders'},
          el('h4', null, 'Upcoming renders'),
          upcomingBox
        )
      ),
      errorSlot,
      el('h4', null, 'Log'),
      logBox,
      el(
        'p',
        {className: 'ex-footnote'},
        'Stepped for illustration: the frame runs React with a mock scheduler, so renders only happen when you step. Sync updates still render right away, like they do in the browser.'
      )
    )
  );

  const instance = {
    kind: 'queue',
    frame,
    proxy: methods(frame, ['reset', 'dispatch', 'step', 'snapshot']),
    start: reset,
  };
  return instance;
}
