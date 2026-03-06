'use client';

const React = require('react');
const {useContext} = React;
const StressTestContext = require('./StressTestContext');

const colors = {
  card: '#ffffff',
  divider: '#c6c6c8',
};

function StressTestItemRow({id, children}) {
  const {highlightedId} = useContext(StressTestContext);
  const isHighlighted =
    highlightedId === -2 ? id % 2 === 0 : id === highlightedId;

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

module.exports = StressTestItemRow;
module.exports.default = StressTestItemRow;
