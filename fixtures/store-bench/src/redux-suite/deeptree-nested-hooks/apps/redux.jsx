// Redux: the deeptree-nested-hooks scenario from reduxjs/react-redux-benchmarks
// (src/scenarios/deeptree-nested-hooks), maintained by the Redux team.
// Copyright (c) 2018 Redux, MIT License.
//
// counters.js, strings.js, Slice.jsx and App.jsx are kept as written. Changes:
// - The ID and character generators (generators.js) are seeded and restart on
//   every mount, instead of using Math.random() and a module-level counter.
// - The store is created per mount, the dispatch timing middleware and
//   <Profiler> are dropped (the harness clicks the buttons in flushSync), and
//   counted() wraps selectors and mapState in the counting build.

import React, {useEffect} from 'react';
import {configureStore, createSlice} from '@reduxjs/toolkit';
import {Provider, connect, useSelector, useDispatch} from 'react-redux';
import {startSuiteBench} from '../../common/harness';
import {countRender, counted} from '../../common/instrument';
import {scenarios} from '../scenarios';
import * as c from '../constants';
import {TEXT_INPUT_MOD, TREE_DEPTH} from '../constants';
import {
  createStringId,
  getNextCharacter,
  getRandomInt,
  getRandomCounterId,
  resetGenerators,
} from '../generators';

// ---------------------------------------------------------------- counters.js

const {reducer: countersReducer, actions: counterActions} = createSlice({
  name: 'counters',
  initialState: {},
  reducers: {
    initialize(state, action) {
      const {numberOfCounters} = action.payload;
      for (let i = 0; i < numberOfCounters; i++) {
        state[i] = 0;
      }
    },
    increment(state, action) {
      const {counterId} = action.payload;
      const value = state[counterId] || 0;
      state[counterId] = value + 1;
    },
    incrementMany(state, action) {
      const {mod} = action.payload;
      for (let counterId = 0; counterId < c.NUMBER_OF_SLICES; counterId++) {
        if (counterId % mod === 0) {
          const value = state[counterId] || 0;
          state[counterId] = value + 1;
        }
      }
    },
  },
});

const {increment, incrementMany} = counterActions;
const initializeCounters = counterActions.initialize;

function incrementRandomCounter() {
  const counterId = getRandomCounterId(c.NUMBER_OF_SLICES);
  return increment({counterId});
}

// ---------------------------------------------------------------- strings.js

const {reducer: stringsReducer, actions: stringActions} = createSlice({
  name: 'strings',
  initialState: {},
  reducers: {
    initialize(state, action) {
      const {stringId} = action.payload;
      state[stringId] = 'a';
    },
    append(state, action) {
      const {stringId, character} = action.payload;

      if (state[stringId]) {
        state[stringId] += character;
      }
    },
    appendMany(state, action) {
      const {mod, character} = action.payload;
      const keys = Object.keys(state);

      keys.forEach((stringId, index) => {
        if (index % mod === 0) {
          state[stringId] += character;
        }
      });
      for (let counterId = 0; counterId < c.NUMBER_OF_SLICES; counterId++) {
        if (counterId % mod === 0) {
          const value = state[counterId] || 0;
          state[counterId] = value + 1;
        }
      }
    },
  },
});

const {initialize, append, appendMany} = stringActions;

function appendRandomCharacter() {
  const sliceId = getRandomInt(0, c.NUMBER_OF_SLICES);
  const maxTextsPerSlice = Math.floor(TREE_DEPTH / TEXT_INPUT_MOD);
  const selectedTextId = getRandomInt(1, maxTextsPerSlice);

  const character = getNextCharacter();

  const stringId = createStringId(sliceId, selectedTextId);

  return append({stringId, character});
}

function appendRandomCharToMany(mod) {
  const character = getNextCharacter();

  return appendMany({mod, character});
}

// ---------------------------------------------------------------- Slice.jsx

const Counter = ({idx}) => {
  countRender();
  const value = useSelector(counted(state => state.counters[idx]));
  return <div>Value: {value}</div>;
};

Counter.displayName = 'Counter';

const TextDisplay = ({idx, inputId, children}) => {
  countRender();
  const dispatch = useDispatch();
  const stringId = createStringId(idx, inputId);
  const text = useSelector(
    counted(state => {
      const text = state.strings[stringId] || 'unknown';
      return text;
    })
  );

  useEffect(() => {
    dispatch(initialize({stringId}));
  }, []);

  return (
    <div>
      Text {stringId}:<br />
      <textarea value={text} />
      {children}
    </div>
  );
};
TextDisplay.displayName = 'TextDisplay';

const Slice = ({remainingDepth, idx}) => {
  countRender();
  if (remainingDepth > 0) {
    let renderedChild = (
      <div>
        {idx}.{remainingDepth}
        <div>
          <Slice idx={idx} remainingDepth={remainingDepth - 1} />
        </div>
      </div>
    );

    if (remainingDepth % TEXT_INPUT_MOD === 0) {
      renderedChild = (
        <TextDisplay idx={idx} inputId={remainingDepth / TEXT_INPUT_MOD}>
          {renderedChild}
        </TextDisplay>
      );
    }

    return renderedChild;
  }

  return <Counter idx={idx} />;
};
Slice.displayName = 'Slice';

// ---------------------------------------------------------------- App.jsx

let slices;

const mapState = counted(state => {
  if (!slices) {
    slices = Array.from({length: c.NUMBER_OF_SLICES}).map((dummy, idx) => idx);
  }

  return {slices};
});

function doUpdateMany(mod) {
  return incrementMany({mod});
}

const mapDispatch = {
  incrementRandomCounter,
  incrementFifth: () => doUpdateMany(5),
  incrementThird: () => doUpdateMany(3),
  appendRandomCharacter,
  appendMany: () => appendRandomCharToMany(4),
};

class App extends React.Component {
  render() {
    countRender();
    return (
      <div>
        <div>
          <button
            id="incrementRandom"
            onClick={this.props.incrementRandomCounter}>
            Update Random Counter
          </button>
          <button id="incrementFifth" onClick={this.props.incrementFifth}>
            Update 1/5 Counters
          </button>
          <button id="incrementThird" onClick={this.props.incrementThird}>
            Update 1/3 Counters
          </button>
          <button
            id="appendRandomCharacter"
            onClick={this.props.appendRandomCharacter}>
            Append Random Char
          </button>
          <button id="appendMany" onClick={this.props.appendMany}>
            Append Char to Many
          </button>
        </div>
        <div className="row">
          {this.props.slices.map((slice, idx) => {
            return (
              <div style={{display: 'inline-block', minWidth: 70}} key={idx}>
                <Slice idx={slice} remainingDepth={c.TREE_DEPTH} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
App.displayName = 'App';

const ConnectedApp = connect(mapState, mapDispatch)(App);

// ---------------------------------------------------------------- index.tsx

let store = null;

function Root() {
  return (
    <Provider store={store}>
      <ConnectedApp />
    </Provider>
  );
}

function createApp() {
  resetGenerators();
  store = configureStore({
    reducer: {
      counters: countersReducer,
      strings: stringsReducer,
    },
    middleware: gdm =>
      gdm({
        immutabilityCheck: false,
        serializableCheck: false,
      }),
  });

  store.dispatch(initializeCounters({numberOfCounters: c.NUMBER_OF_SLICES}));
  return {App: Root, actions: {}};
}

startSuiteBench('redux', createApp, scenarios);
