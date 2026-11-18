// Immutable state updates for the variants that keep all state in one object
// (context, zustand). Same shape and same work as the single store variant.

import {createEntity} from './data';

export function createInitialState(initialEntities) {
  const entities = {};
  for (let i = 0; i < initialEntities.length; i++) {
    entities[initialEntities[i].id] = initialEntities[i];
  }
  return {
    entities,
    ids: initialEntities.map(e => e.id),
    labels: initialEntities.map(e => e.label),
    selected: null,
    filter: '',
    filterInput: '',
    expanded: {},
    details: 0,
    nextIndex: initialEntities.length,
    added: [],
  };
}

export const updates = {
  editEntity(state, index) {
    const id = 'e' + index;
    return {
      ...state,
      entities: {
        ...state.entities,
        [id]: {...state.entities[id], x: state.entities[id].x + 1},
      },
    };
  },
  select(state, index) {
    return {...state, selected: 'e' + index};
  },
  setFilter(state, value) {
    return {...state, filter: value, filterInput: value};
  },
  setFilterInput(state, value) {
    return {...state, filterInput: value};
  },
  setListFilter(state, value) {
    return {...state, filter: value};
  },
  expandEvery(state, {k, n}) {
    const expanded = {};
    for (let i = 0; i < n; i += k) {
      expanded['e' + i] = true;
    }
    return {...state, expanded};
  },
  tickDetails(state) {
    return {...state, details: state.details + 1};
  },
  add(state) {
    const entity = createEntity(state.nextIndex);
    return {
      ...state,
      entities: {...state.entities, [entity.id]: entity},
      ids: [...state.ids, entity.id],
      labels: [...state.labels, entity.label],
      nextIndex: state.nextIndex + 1,
      added: [...state.added, entity.id],
    };
  },
  removeLast(state) {
    const id = state.added[state.added.length - 1];
    const entities = {...state.entities};
    delete entities[id];
    return {
      ...state,
      entities,
      ids: state.ids.filter(other => other !== id),
      labels: state.labels.slice(0, -1),
      added: state.added.slice(0, -1),
    };
  },
};

export function reducer(state, action) {
  return updates[action.type](state, action.payload);
}
