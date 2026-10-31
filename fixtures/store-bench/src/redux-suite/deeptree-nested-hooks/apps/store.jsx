// use(store), idiomatic: a store per counter and a store per string, read by
// the Counter and TextDisplay at the bottom of each slice's tree. The strings
// start as 'a', which is what the Redux version sets in a mount effect.
//
// appendMany in the original appends to every 4th key of the strings state in
// Object.keys() order, and also writes numeric keys into that state (a bug,
// kept as written). Numeric keys enumerate first, so after the first
// appendMany they shift which strings are picked. To pick the same strings,
// this variant keeps the list of strings in the order the Redux version
// creates them, plus the set of numeric keys.
//
// Port of the deeptree-nested-hooks scenario from
// reduxjs/react-redux-benchmarks. Copyright (c) 2018 Redux, MIT License.

import {use, unstable_createStore as createStore} from 'react';
import {startSuiteBench} from '../../common/harness';
import {countRender} from '../../common/instrument';
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

let s = null;

const Counter = ({idx}) => {
  countRender();
  return <div>Value: {use(s.counters[idx])}</div>;
};

const TextDisplay = ({idx, inputId, children}) => {
  countRender();
  const stringId = createStringId(idx, inputId);
  const text = use(s.strings.get(stringId));
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
  s.counters[counterId].update(value => value + 1);
}

function incrementMany(mod) {
  for (let counterId = 0; counterId < c.NUMBER_OF_SLICES; counterId++) {
    if (counterId % mod === 0) {
      s.counters[counterId].update(value => value + 1);
    }
  }
}

function appendRandomCharacter() {
  const sliceId = getRandomInt(0, c.NUMBER_OF_SLICES);
  const maxTextsPerSlice = Math.floor(TREE_DEPTH / TEXT_INPUT_MOD);
  const selectedTextId = getRandomInt(1, maxTextsPerSlice);
  const character = getNextCharacter();
  const string = s.strings.get(createStringId(sliceId, selectedTextId));
  if (string !== undefined) {
    string.update(text => text + character);
  }
}

function appendMany(mod) {
  const character = getNextCharacter();
  const offset = s.numericKeys.size;
  s.stringIds.forEach((stringId, index) => {
    if ((offset + index) % mod === 0) {
      s.strings.get(stringId).update(text => text + character);
    }
  });
  for (let counterId = 0; counterId < c.NUMBER_OF_SLICES; counterId++) {
    if (counterId % mod === 0) {
      s.numericKeys.add(counterId);
    }
  }
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
  // The order the Redux version's mount effects create the strings in: child
  // effects run first, so each slice's deepest TextDisplay comes first.
  const stringIds = [];
  for (let idx = 0; idx < c.NUMBER_OF_SLICES; idx++) {
    for (let inputId = 1; inputId <= TREE_DEPTH / TEXT_INPUT_MOD; inputId++) {
      stringIds.push(createStringId(idx, inputId));
    }
  }
  s = {
    counters: Array.from({length: c.NUMBER_OF_SLICES}).map(() =>
      createStore(0)
    ),
    strings: new Map(stringIds.map(id => [id, createStore('a')])),
    stringIds,
    numericKeys: new Set(),
  };
  return {App, actions: {}};
}

startSuiteBench('store', createApp, scenarios);
