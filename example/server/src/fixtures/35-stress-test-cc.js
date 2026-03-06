const React = require('react');
const StressTestCC = require('../components/StressTestCC');

const fixture = {
  title: 'Stress Test (Client)',
  description: 'Everything is client-rendered — list, items, layout, counters',
  category: 'Performance',
};

function StressTestCCFixture() {
  return <StressTestCC />;
}

module.exports = StressTestCCFixture;
module.exports.default = StressTestCCFixture;
module.exports.fixture = fixture;
