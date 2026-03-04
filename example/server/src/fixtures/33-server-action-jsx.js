var React = require('react');
var {generateCard, getCards} = require('../actions/card-actions');
var CardGenerator = require('../components/CardGenerator');

var fixture = {
  title: 'AI Card Generator',
  description: 'Claude generates UI components as JSX via server actions',
  category: 'Server Actions',
};

function ServerActionJsx() {
  var cards = getCards();
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>AI Card Generator</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Describe a UI component and Claude will generate it as JSX
        </p>
      </div>
      <CardGenerator generateCard={generateCard} />
      {cards.map(function (card) {
        return (
          <div key={card.id} style={{display: 'flex', flexDirection: 'column', gap: 4}}>
            <p style={{color: '#8e8e93', fontSize: 12, marginTop: 0, marginBottom: 0}}>
              {card.prompt}
            </p>
            <div>{card.content}</div>
          </div>
        );
      })}
    </div>
  );
}

module.exports = ServerActionJsx;
module.exports.default = ServerActionJsx;
module.exports.fixture = fixture;
