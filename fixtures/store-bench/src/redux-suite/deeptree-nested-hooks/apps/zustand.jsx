// Zustand: one store with the same shape and updates as the Redux version, a
// selector per component, and the same mount effect that initializes each
// string. The updates are the Redux reducers written immutably.
//
// Port of the deeptree-nested-hooks scenario from
// reduxjs/react-redux-benchmarks. Copyright (c) 2018 Redux, MIT License.

import {useEffect} from 'react';
import {create} from 'zustand';
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

const useBench = create(() => ({counters: {}, strings: {}}));

function initializeString(stringId) {
  useBench.setState(state => ({strings: {...state.strings, [stringId]: 'a'}}));
}

const Counter = ({idx}) => {
  countRender();
  const value = useBench(counted(state => state.counters[idx]));
  return <div>Value: {value}</div>;
};

const TextDisplay = ({idx, inputId, children}) => {
  countRender();
  const stringId = createStringId(idx, inputId);
  const text = useBench(counted(state => state.strings[stringId] || 'unknown'));

  useEffect(() => {
    initializeString(stringId);
  }, []);

  return (
    <div>
      Text {stringId}:<br />
      <textarea value={text} />
      {children}
    </div>
  );
};

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

function incrementRandomCounter() {
  const counterId = getRandomCounterId(c.NUMBER_OF_SLICES);
  useBench.setState(state => ({
    counters: {
      ...state.counters,
      [counterId]: (state.counters[counterId] || 0) + 1,
    },
  }));
}

function incrementMany(mod) {
  useBench.setState(state => {
    const counters = {...state.counters};
    for (let counterId = 0; counterId < c.NUMBER_OF_SLICES; counterId++) {
      if (counterId % mod === 0) {
        counters[counterId] = (counters[counterId] || 0) + 1;
      }
    }
    return {counters};
  });
}

function appendRandomCharacter() {
  const sliceId = getRandomInt(0, c.NUMBER_OF_SLICES);
  const maxTextsPerSlice = Math.floor(TREE_DEPTH / TEXT_INPUT_MOD);
  const selectedTextId = getRandomInt(1, maxTextsPerSlice);
  const character = getNextCharacter();
  const stringId = createStringId(sliceId, selectedTextId);
  useBench.setState(state =>
    state.strings[stringId]
      ? {
          strings: {
            ...state.strings,
            [stringId]: state.strings[stringId] + character,
          },
        }
      : state
  );
}

function appendMany(mod) {
  const character = getNextCharacter();
  useBench.setState(state => {
    const strings = {...state.strings};
    Object.keys(strings).forEach((stringId, index) => {
      if (index % mod === 0) {
        strings[stringId] += character;
      }
    });
    for (let counterId = 0; counterId < c.NUMBER_OF_SLICES; counterId++) {
      if (counterId % mod === 0) {
        strings[counterId] = (strings[counterId] || 0) + 1;
      }
    }
    return {strings};
  });
}

const slices = Array.from({length: c.NUMBER_OF_SLICES}).map((_, idx) => idx);

function App() {
  return (
    <div>
      <div>
        <button id="incrementRandom" onClick={incrementRandomCounter}>
          Update Random Counter
        </button>
        <button id="incrementFifth" onClick={() => incrementMany(5)}>
          Update 1/5 Counters
        </button>
        <button id="incrementThird" onClick={() => incrementMany(3)}>
          Update 1/3 Counters
        </button>
        <button id="appendRandomCharacter" onClick={appendRandomCharacter}>
          Append Random Char
        </button>
        <button id="appendMany" onClick={() => appendMany(4)}>
          Append Char to Many
        </button>
      </div>
      <div className="row">
        {slices.map((slice, idx) => {
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

function createApp() {
  resetGenerators();
  const counters = {};
  for (let i = 0; i < c.NUMBER_OF_SLICES; i++) {
    counters[i] = 0;
  }
  useBench.setState({counters, strings: {}}, true);
  return {App, actions: {}};
}

startSuiteBench('zustand', createApp, scenarios);
