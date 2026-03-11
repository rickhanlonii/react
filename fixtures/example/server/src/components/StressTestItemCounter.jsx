'use client';

const React = require('react');
const {useContext} = React;
const StressTestContext = require('./StressTestContext');

const colors = {
  text: '#1c1c1e',
  danger: '#ff3b30',
  success: '#34c759',
};

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

function StressTestItemCounter({id}) {
  const {counts, increment, decrement} = useContext(StressTestContext);
  const count = counts[id] || 0;

  return (
    <CounterContainer>
      <CounterButton
        id={'stress-dec-' + id}
        onClick={() => decrement(id)}
        color={colors.danger}
        label="-"
      />
      <CounterDisplay>{String(count)}</CounterDisplay>
      <CounterButton
        id={'stress-inc-' + id}
        onClick={() => increment(id)}
        color={colors.success}
        label="+"
      />
    </CounterContainer>
  );
}

module.exports = StressTestItemCounter;
module.exports.default = StressTestItemCounter;
