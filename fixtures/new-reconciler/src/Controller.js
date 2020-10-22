import * as React from 'react';

import {getParam, setParam} from './state';

function Controller() {
  const [depth, setDepth] = React.useState(getParam('depth', 'int'));
  const [hiddenTrees, setHiddenTrees] = React.useState(
    getParam('hidden', 'int')
  );
  const [mountedTrees, setMountedTrees] = React.useState(
    getParam('mount', 'int')
  );

  function handleDepthChange(e) {
    const newValue = parseInt(e.target.value);
    if (newValue >= 0) {
      setParam('depth', newValue);
      setDepth(newValue);
    }
  }

  function handleHiddenTreesChange(e) {
    const newValue = parseInt(e.target.value);
    if (newValue >= 0) {
      setParam('hidden', newValue);
      setHiddenTrees(newValue);
    }
  }

  function handleMountedTreesChange(e) {
    const newValue = parseInt(e.target.value);
    if (newValue >= 0) {
      setParam('mount', newValue);
      setMountedTrees(newValue);
    }
  }

  return (
    <div>
      <div>
        <label className="label">Depth</label>
        <input
          type="number"
          className="input"
          onChange={handleDepthChange}
          value={depth}
        />
      </div>
      <div>
        <label className="label">Hidden trees</label>
        <input
          type="number"
          className="input"
          onChange={handleHiddenTreesChange}
          value={hiddenTrees}
        />
      </div>
      <div>
        <label className="label">Trees to mount</label>
        <input
          type="number"
          className="input"
          onChange={handleMountedTreesChange}
          value={mountedTrees}
        />
      </div>
    </div>
  );
}

export default Controller;
