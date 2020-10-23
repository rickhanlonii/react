import React from 'react';
import * as ReactDOM from './vendor/ReactDOM-profiling';
import * as ReactDOMForked from './vendor/ReactDOMForked-profiling';
import App from './App';
import Controller from './Controller';
import './index.css';

import {getParam} from './state';

function format(totalDuration, totalCount) {
  return totalCount === 0 ? '0.0' : (totalDuration / totalCount).toFixed(1);
}

function Renderer({children, title}) {
  const [mount, setMount] = React.useState(false);
  const [depth, setDepth] = React.useState(getParam('depth'));
  const [mountedTrees, setMountedTrees] = React.useState(
    getParam('mount', 'int')
  );
  const [hiddenTrees, setHiddenTrees] = React.useState(
    getParam('hidden', 'int')
  );
  const [, forceUpdate] = React.useState(false);

  React.useEffect(() => {
    const listener = function(e) {
      setDepth(getParam('depth'));
      setHiddenTrees(getParam('hidden', 'int'));
      setMountedTrees(getParam('mount', 'int'));
    };

    window.addEventListener('pushState', listener);

    return () => {
      window.removeEventListener('pushState', listener);
    };
  }, []);

  const [durations, setDurations] = React.useState({
    mount: {
      totalDuration: 0,
      totalCount: 0,
    },
    unmount: {
      totalDuration: 0,
      totalCount: 0,
    },
    update: {
      totalDuration: 0,
      totalCount: 0,
    },
  });

  const dataRef = React.useRef({
    markName: null,
    startTime: null,
  });

  function start(markName) {
    const data = dataRef.current;
    data.markName = markName;
    data.startTime = performance.now();

    performance.mark(markName);
  }

  function handleMountUnmount() {
    start(mount ? 'unmount' : 'mount');
    setMount(!mount);
  }

  function handleUpdate() {
    start('update');
    forceUpdate(value => !value);
  }

  function onRender() {
    const {markName, startTime} = dataRef.current;
    if (markName !== null) {
      dataRef.current.markName = null;

      performance.measure(markName);

      const data = durations[markName];
      if (data != null) {
        const duration = performance.now() - startTime;

        const totalDuration = data.totalDuration + duration;
        const totalCount = data.totalCount + 1;

        setDurations(prevState => {
          return {
            ...prevState,
            [markName]: {
              totalDuration,
              totalCount,
            },
          };
        });
      }
    }
  }

  const mountAverage = format(
    durations.mount.totalDuration,
    durations.mount.totalCount
  );
  const unmountAverage = format(
    durations.unmount.totalDuration,
    durations.unmount.totalCount
  );
  const updateAverage = format(
    durations.update.totalDuration,
    durations.update.totalCount
  );

  return (
    <>
      <div className="heading">
        <h1>{title}</h1>
        <button onClick={handleMountUnmount}>
          {mount ? 'Unmount' : 'Mount'}
        </button>
        <button disabled={!mount} onClick={handleUpdate}>
          Update
        </button>
      </div>
      <div className="durations">
        <div>
          mount: {mountAverage}ms ({durations.mount.totalCount})
        </div>
        <div>
          unmount: {unmountAverage}ms ({durations.unmount.totalCount})
        </div>
        <div>
          update: {updateAverage}ms ({durations.update.totalCount})
        </div>
      </div>
      <React.Profiler id="app" onRender={onRender}>
        <div className="app-container">
          {mount ? (
            [...new Array(mountedTrees)].map((_, i) => (
              <div key={i}>{children({depth})}</div>
            ))
          ) : (
            <div>
              Will mount {mountedTrees} trees with depth {depth}
            </div>
          )}
          {[...new Array(hiddenTrees)].map((_, i) => (
            <div key={i}>{children({depth, hidden: hiddenTrees > 0})}</div>
          ))}
        </div>
      </React.Profiler>
    </>
  );
}

ReactDOM.unstable_createRoot(document.getElementById('controller')).render(
  <Controller />
);
ReactDOM.unstable_createRoot(document.getElementById('old')).render(
  <Renderer title="Old Renderer">{props => <App {...props} />}</Renderer>
);
ReactDOMForked.unstable_createRoot(document.getElementById('new')).render(
  <Renderer title="New Renderer">{props => <App {...props} />}</Renderer>
);
