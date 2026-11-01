// Reads a store's internals for the explainers. In a frame, snapshots come
// from the sandbox's inspectStore (sandbox/frame.js, see sandbox/API.md); in
// Node (src/demos/test/), from the reader below, which follows the same
// shapes: packages/react/src/ReactStore.js (the store) and
// packages/react-reconciler/src/ReactFiberStore.js (a root's record).
// They're private and can change, so every read is guarded, and an explainer
// shows an error instead of a wrong picture if they do. G4 fails on that
// error.
//
// The demos also touch a record directly for two things the snapshot doesn't
// have: the root's pending lanes and whether the record has queued updates
// (src/demos/frames/queue.js uses them to tell which lane an update got).

'use strict';

const {laneName} = require('../runtime/queue-preview');

function fail(what) {
  throw new Error(
    'The store internals changed (' +
      what +
      '). Update docs/use-store/src/demos/frames/internals.js.'
  );
}

function checkShape(store) {
  if (store == null || !Array.isArray(store._records)) {
    fail('store._records');
  }
  if (typeof store._reducer !== 'function' || !('_headQueue' in store)) {
    fail('store._reducer or store._headQueue');
  }
  for (let i = 0; i < store._records.length; i++) {
    const record = store._records[i];
    if (
      !('pending' in record) ||
      record.committed == null ||
      !('baseQueue' in record.committed) ||
      !('baseState' in record.committed) ||
      !('memoizedState' in record.committed) ||
      !(record.readers instanceof Set) ||
      typeof record.lanes !== 'number' ||
      record.root == null ||
      typeof record.root.pendingLanes !== 'number'
    ) {
      fail('record fields');
    }
  }
}

// A circular list of updates, from its last update, as an array in order.
function listToArray(last) {
  const updates = [];
  if (last !== null) {
    let update = last.next;
    do {
      updates.push({
        lane: update.lane,
        laneName: laneName(update.lane),
        action: update.action,
      });
      update = update.next;
    } while (update !== last.next);
  }
  return updates;
}

function readerName(fiber) {
  const type = fiber.type;
  if (typeof type === 'function') {
    return type.displayName || type.name || 'Anonymous';
  }
  if (type != null && typeof type === 'object' && type.displayName) {
    return type.displayName;
  }
  return fiber.tag === 13 ? 'Suspense' : String(type);
}

// Readers are fibers, and a reader can be in the set as either of its two
// fibers. Count components, not fibers.
function readerNames(readers) {
  const seen = new Set();
  const names = [];
  readers.forEach(fiber => {
    if (seen.has(fiber) || (fiber.alternate && seen.has(fiber.alternate))) {
      return;
    }
    seen.add(fiber);
    names.push(readerName(fiber));
  });
  return names;
}

// The store's latest value without changing the store (getStoreHead folds
// the head queue into _head; this folds a copy).
function peekHead(store) {
  let head = store._head;
  const queue = store._headQueue;
  if (queue !== null) {
    for (let i = 0; i < queue.length; i++) {
      try {
        head = store._reducer(head, queue[i]);
      } catch (error) {
        // getStoreHead skips updates that throw.
      }
    }
  }
  return head;
}

// The record of the store on a root (the first one if root is omitted), or
// null if that root doesn't read the store.
function findRecord(store, root) {
  checkShape(store);
  const records = store._records;
  for (let i = 0; i < records.length; i++) {
    if (root === undefined || records[i].root === root) {
      return records[i];
    }
  }
  return null;
}

function readRecord(record) {
  const names = readerNames(record.readers);
  return {
    baseState: record.committed.baseState,
    committedValue: record.committed.memoizedState,
    baseQueue: listToArray(record.committed.baseQueue),
    pending: listToArray(record.pending),
    lanes: record.lanes,
    transitionLanes: record.transitionLanes,
    rootPendingLanes: record.root.pendingLanes,
    readers: names,
    readerCount: names.length,
  };
}

// The sandbox's inspectStore snapshot, in the shape readRecord returns. Lane
// names come from queue-preview.js, so every explainer names lanes the same
// way.
function fromInspector(snapshot) {
  if (!snapshot.ok) {
    throw new Error(snapshot.reason);
  }
  const record = snapshot.record;
  function updates(list) {
    return list.map(u => ({
      lane: u.lane,
      laneName: laneName(u.lane),
      action: u.action,
    }));
  }
  return record === null
    ? null
    : {
        baseState: record.committed.baseState,
        committedValue: record.committed.memoizedState,
        baseQueue: updates(record.baseQueue),
        pending: updates(record.pending),
        readers: record.readers.slice(),
        readerCount: record.readerCount,
      };
}

function inspector() {
  return typeof window !== 'undefined' &&
    typeof window.inspectStore === 'function'
    ? window.inspectStore
    : null;
}

// The first root's record of the store, or null.
function snapshotRecord(store) {
  const inspect = inspector();
  if (inspect !== null) {
    return fromInspector(inspect(store));
  }
  const record = findRecord(store);
  return record === null ? null : readRecord(record);
}

function readStore(store) {
  const inspect = inspector();
  if (inspect !== null) {
    const snapshot = inspect(store);
    return {
      records: snapshot.ok ? snapshot.records.length : 0,
      head: peekHead(store),
      heldTransitionUpdates: snapshot.ok
        ? snapshot.heldTransitionUpdates.length
        : 0,
      record: fromInspector(snapshot),
    };
  }
  const record = findRecord(store);
  return {
    records: store._records.length,
    head: peekHead(store),
    heldTransitionUpdates:
      store._pendingTransitionUpdates == null
        ? 0
        : store._pendingTransitionUpdates.length / 2,
    record: record === null ? null : readRecord(record),
  };
}

module.exports = {
  checkShape,
  findRecord,
  readRecord,
  snapshotRecord,
  readStore,
  peekHead,
};
