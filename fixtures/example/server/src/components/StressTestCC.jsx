'use client';

const React = require('react');
const {useState, useCallback, useMemo} = React;

const ITEM_COUNT = 200;

const colors = {
  bg: '#f2f2f7',
  card: '#ffffff',
  accent: '#007aff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  divider: '#c6c6c8',
  danger: '#ff3b30',
  success: '#34c759',
};

function generateItems(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: i,
      title: 'Item ' + i,
      subtitle: 'Description for item ' + i,
      count: 0,
    });
  }
  return items;
}

// Every wrapper is a client component — reconciler pays for each one

function PageContainer({children}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.bg,
        minHeight: '100%',
      }}>
      {children}
    </div>
  );
}

function PageHeader({children}) {
  return (
    <div
      style={{
        paddingTop: 48,
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 16,
      }}>
      {children}
    </div>
  );
}

function PageTitle({children}) {
  return (
    <h1 style={{color: colors.text, marginTop: 0, marginBottom: 4}}>
      {children}
    </h1>
  );
}

function PageSubtitle({children}) {
  return (
    <p style={{color: colors.secondary, fontSize: 15, marginTop: 0}}>
      {children}
    </p>
  );
}

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

function ItemRow({isHighlighted, children}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: isHighlighted ? '#e8f0fe' : colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}>
      {children}
    </div>
  );
}

function ItemTextContainer({children}) {
  return <div style={{flex: 1}}>{children}</div>;
}

function ItemTitle({children}) {
  return (
    <p
      style={{
        color: colors.text,
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 0,
        marginBottom: 2,
      }}>
      {children}
    </p>
  );
}

function ItemSubtitle({children}) {
  return (
    <p
      style={{
        color: colors.secondary,
        fontSize: 13,
        marginTop: 0,
        marginBottom: 0,
      }}>
      {children}
    </p>
  );
}

function CounterContainer({children}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
      {children}
    </div>
  );
}

function CounterButton({id, onClick, color, label}) {
  return (
    <button
      id={id}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: color,
      }}>
      <span style={{color: '#ffffff', fontSize: 18, textAlign: 'center'}}>
        {label}
      </span>
    </button>
  );
}

function CounterDisplay({children}) {
  return (
    <span
      style={{
        color: colors.text,
        fontSize: 16,
        fontWeight: 'bold',
        width: 32,
        textAlign: 'center',
      }}>
      {children}
    </span>
  );
}

function ItemCounter({id, count, onIncrement, onDecrement}) {
  return (
    <CounterContainer>
      <CounterButton
        id={'stress-cc-dec-' + id}
        onClick={() => onDecrement(id)}
        color={colors.danger}
        label="-"
      />
      <CounterDisplay>{String(count)}</CounterDisplay>
      <CounterButton
        id={'stress-cc-inc-' + id}
        onClick={() => onIncrement(id)}
        color={colors.success}
        label="+"
      />
    </CounterContainer>
  );
}

function StressTestCCItem({id, title, subtitle, count, onIncrement, onDecrement, isHighlighted}) {
  return (
    <ItemRow isHighlighted={isHighlighted}>
      <ItemTextContainer>
        <ItemTitle>{title}</ItemTitle>
        <ItemSubtitle>{subtitle}</ItemSubtitle>
      </ItemTextContainer>
      <ItemCounter
        id={id}
        count={count}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />
    </ItemRow>
  );
}

function StressTestCC() {
  const [items, setItems] = useState(() => generateItems(ITEM_COUNT));
  const [highlightedId, setHighlightedId] = useState(-1);

  const handleIncrement = useCallback(
    id => {
      setItems(prev =>
        prev.map(item =>
          item.id === id ? {...item, count: item.count + 1} : item,
        ),
      );
    },
    [],
  );

  const handleDecrement = useCallback(
    id => {
      setItems(prev =>
        prev.map(item =>
          item.id === id ? {...item, count: item.count - 1} : item,
        ),
      );
    },
    [],
  );

  const handleIncrementAll = useCallback(() => {
    setItems(prev => prev.map(item => ({...item, count: item.count + 1})));
  }, []);

  const handleResetAll = useCallback(() => {
    setItems(prev => prev.map(item => ({...item, count: 0})));
  }, []);

  const handleHighlightEveryOther = useCallback(() => {
    setHighlightedId(prev => (prev === -1 ? -2 : -1));
  }, []);

  const totalCount = useMemo(
    () => items.reduce((sum, item) => sum + item.count, 0),
    [items],
  );

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Stress Test (Client)</PageTitle>
        <PageSubtitle>
          {String(ITEM_COUNT)} items — everything is client-rendered
        </PageSubtitle>
      </PageHeader>

      <ControlsContainer>
        <ControlsTitle>Controls</ControlsTitle>
        <ControlsSubtitle>Total: {String(totalCount)}</ControlsSubtitle>

        <ButtonRow>
          <button
            id="stress-cc-increment-all"
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
            id="stress-cc-reset-all"
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
            id="stress-cc-highlight-toggle"
            onClick={handleHighlightEveryOther}
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

      <ScrollContainer>
        {items.map(item => (
          <StressTestCCItem
            key={item.id}
            id={item.id}
            title={item.title}
            subtitle={item.subtitle}
            count={item.count}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            isHighlighted={
              highlightedId === -2 ? item.id % 2 === 0 : item.id === highlightedId
            }
          />
        ))}
      </ScrollContainer>
    </PageContainer>
  );
}

module.exports = StressTestCC;
module.exports.default = StressTestCC;
