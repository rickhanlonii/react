// use(store): one store for the counter, read by every component.
//
// Port of the many-components-same-slice scenario from
// reduxjs/react-redux-benchmarks. Copyright (c) 2018 Redux, MIT License.

import {use, unstable_createStore as createStore} from 'react';
import {startSuiteBench} from '../../common/harness';
import {countRender} from '../../common/instrument';
import {scenarios, NUMBER_OF_COMPONENTS} from '../scenarios';

let counter = null;

function Component() {
  countRender();
  return <div>{use(counter)}</div>;
}

function App() {
  return (
    <div>
      {Array.from({length: NUMBER_OF_COMPONENTS}).map((_, index) => (
        <Component key={index} />
      ))}
    </div>
  );
}

function createApp() {
  counter = createStore(0);
  return {
    App,
    actions: {
      increment() {
        counter.update(c => c + 1);
      },
    },
  };
}

startSuiteBench('store', createApp, scenarios);
