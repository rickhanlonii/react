const React = require('react');
const StressTestControls = require('../components/StressTestControls');
const StressTestItemRow = require('../components/StressTestItemRow');
const StressTestItemCounter = require('../components/StressTestItemCounter');

const fixture = {
  title: 'Stress Test (Server)',
  description: 'Server-rendered items with client context for state',
  category: 'Performance',
};

const ITEM_COUNT = 50;

const colors = {
  bg: '#f2f2f7',
  text: '#1c1c1e',
  secondary: '#8e8e93',
};

// Every wrapper is a server component — RSC collapses these into plain elements

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

function StressTestItem({id}) {
  return (
    <StressTestItemRow id={id}>
      <ItemTextContainer>
        <ItemTitle>{'Item ' + id}</ItemTitle>
        <ItemSubtitle>{'Description for item ' + id}</ItemSubtitle>
      </ItemTextContainer>
      <StressTestItemCounter id={id} />
    </StressTestItemRow>
  );
}

function StressTestFixture() {
  const items = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    items.push(<StressTestItem key={i} id={i} />);
  }

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Stress Test (Server)</PageTitle>
        <PageSubtitle>
          {String(ITEM_COUNT)} items — server-rendered, client context for state
        </PageSubtitle>
      </PageHeader>
      <StressTestControls itemCount={ITEM_COUNT}>{items}</StressTestControls>
    </PageContainer>
  );
}

module.exports = StressTestFixture;
module.exports.default = StressTestFixture;
module.exports.fixture = fixture;
