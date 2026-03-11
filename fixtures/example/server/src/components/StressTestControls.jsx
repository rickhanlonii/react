'use client';

const React = require('react');
const {useState, useCallback, useMemo} = React;
const StressTestContext = require('./StressTestContext');

const colors = {
  card: '#ffffff',
  accent: '#007aff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  divider: '#c6c6c8',
  bg: '#f2f2f7',
};

function ControlsContainer({children}) {
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}>
      {children}
    </div>
  );
}

function ControlsTitle({children}) {
  return (
    <h3 style={{color: colors.text, marginTop: 0, marginBottom: 4}}>
      {children}
    </h3>
  );
}

function ControlsSubtitle({children}) {
  return (
    <p
      style={{
        color: colors.secondary,
        fontSize: 13,
        marginTop: 0,
        marginBottom: 12,
      }}>
      {children}
    </p>
  );
}

function ButtonRow({children}) {
  return (
    <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
      {children}
    </div>
  );
}

function ScrollContainer({children}) {
  return (
    <div
      style={{
        height: 500,
        overflow: 'scroll',
        backgroundColor: colors.bg,
      }}>
      {children}
    </div>
  );
}

function StressTestControls({itemCount, children}) {
  const [counts, setCounts] = useState({});
  const [highlightedId, setHighlightedId] = useState(-1);

  const increment = useCallback(id => {
    React.startTransition(() => {
      setCounts(prev => ({...prev, [id]: (prev[id] || 0) + 1}));
    })
  }, []);

  const decrement = useCallback(id => {
    React.startTransition(() => {
      setCounts(prev => ({ ...prev, [id]: (prev[id] || 0) - 1 }));
    });
  }, []);

  const handleIncrementAll = useCallback(() => {
    React.startTransition(() => {
      setCounts(prev => {
        const next = { ...prev };
        for (let i = 0; i < itemCount; i++) {
          next[i] = (next[i] || 0) + 1;
        }
        return next;
      });
    });
  }, [itemCount]);

  const handleResetAll = useCallback(() => {
    React.startTransition(() => {
      setCounts({});
    })
  }, []);

  const handleHighlightToggle = useCallback(() => {
    React.startTransition(() => {
      setHighlightedId(prev => (prev === -1 ? -2 : -1));
    });
  }, []);

  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, c) => sum + c, 0),
    [counts],
  );

  const ctx = useMemo(
    () => ({counts, highlightedId, increment, decrement}),
    [counts, highlightedId, increment, decrement],
  );

  return (
    <StressTestContext.Provider value={ctx}>
      <ControlsContainer>
        <ControlsTitle>Controls</ControlsTitle>
        <ControlsSubtitle>Total: {String(totalCount)}</ControlsSubtitle>

        <ButtonRow>
          <button
            id="stress-increment-all"
            onClick={handleIncrementAll}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 8,
              backgroundColor: colors.accent,
            }}>
            <span style={{color: '#ffffff', fontSize: 14, fontWeight: 'bold'}}>
              +1 All
            </span>
          </button>
          <button
            id="stress-reset-all"
            onClick={handleResetAll}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 8,
              backgroundColor: colors.secondary,
            }}>
            <span style={{color: '#ffffff', fontSize: 14, fontWeight: 'bold'}}>
              Reset All
            </span>
          </button>
          <button
            id="stress-highlight-toggle"
            onClick={handleHighlightToggle}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 8,
              backgroundColor: '#ff9500',
            }}>
            <span style={{color: '#ffffff', fontSize: 14, fontWeight: 'bold'}}>
              Highlight
            </span>
          </button>
        </ButtonRow>
      </ControlsContainer>

      <ScrollContainer>{children}</ScrollContainer>
    </StressTestContext.Provider>
  );
}

module.exports = StressTestControls;
module.exports.default = StressTestControls;
