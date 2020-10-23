import * as React from 'react';

function sleep(ms) {
  const startTime = performance.now();
  while (performance.now() - startTime < ms) {
    // ...
  }
}

function Node({level, depth, children}) {
  React.useLayoutEffect(() => {
    const createDuration = window.createDuration || 0;
    sleep(createDuration);
    return () => {
      const destroyDuration = window.destroyDuration || 0;
      sleep(destroyDuration);
    };
  });
  if (level < depth) {
    return (
      <div className="component">
        <Node level={level + 1} depth={depth} children={children} />
      </div>
    );
  }
  return children;
}

function Leaf() {
  React.useLayoutEffect(() => {
    const createDuration = window.createDuration || 0;
    sleep(createDuration);
    return () => {
      const destroyDuration = window.destroyDuration || 0;
      sleep(destroyDuration);
    };
  });

  return <div className="leaf" />;
}

function App({depth, hidden}) {
  return (
    <div className="tree">
      {hidden && (
        <div className="component hidden">hidden tree of depth {depth}</div>
      )}
      <div hidden={hidden}>
        <Node level={0} depth={depth}>
          <Leaf />
        </Node>
      </div>
    </div>
  );
}

export default App;
