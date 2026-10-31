// Zustand: one store, a selector per component.
//
// Port of the many-components-same-slice scenario from
// reduxjs/react-redux-benchmarks. Copyright (c) 2018 Redux, MIT License.

import {create} from 'zustand';
import {startSuiteBench} from '../../common/harness';
import {countRender, counted} from '../../common/instrument';
import {scenarios, NUMBER_OF_COMPONENTS} from '../scenarios';

const useCounter = create(() => ({counter: 0}));

function Component() {
  countRender();
  const counter = useCounter(counted(state => state.counter));
  return <div>{counter}</div>;
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
  useCounter.setState({counter: 0}, true);
  return {
    App,
    actions: {
      increment() {
        useCounter.setState(state => ({counter: state.counter + 1}));
      },
    },
  };
}

startSuiteBench('zustand', createApp, scenarios);
