import * as React from 'react';

function Node({level, depth, children}) {
  React.useLayoutEffect(() => {
    return () => {};
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
    return () => {};
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
