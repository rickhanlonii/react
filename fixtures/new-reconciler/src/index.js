import React from 'react';
import * as ReactDOM from './vendor/ReactDOM-profiling';
import * as ReactDOMForked from './vendor/ReactDOMForked-profiling';
import App from './App';
import Controller from './Controller';
import './index.css';

import {getParam} from './state';

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

  return (
    <div>
      <div className="heading">
        <h1>{title}</h1>
        <button onClick={() => setMount(mount => !mount)}>
          {mount ? 'Unmount' : 'Mount'}
        </button>
        <button onClick={() => forceUpdate(update => !update)}>Update</button>
      </div>
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
      </div>
      <div className="app-container">
        {[...new Array(hiddenTrees)].map((_, i) => (
          <div key={i}>{children({depth, hidden: hiddenTrees > 0})}</div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.unstable_createRoot(document.getElementById('controller')).render(
  <Controller />
);
ReactDOM.unstable_createRoot(document.getElementById('old')).render(
  <Renderer title="New Renderer">{props => <App {...props} />}</Renderer>
);
ReactDOMForked.unstable_createRoot(document.getElementById('new')).render(
  <Renderer title="Old Renderer">{props => <App {...props} />}</Renderer>
);
