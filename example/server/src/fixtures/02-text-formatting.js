const React = require('react');

const fixture = {
  title: 'Text Formatting',
  description: 'Inline text elements: bold, italic, underline, code, mark, sub, sup',
};

function TextFormatting() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Text Formatting</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Inline text formatting elements
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Rich Text</h3>
        <div style={{height: 1, backgroundColor: '#c6c6c8', marginTop: 8, marginBottom: 12}} />
        <p style={{color: '#1c1c1e'}}>
          This is <b>bold</b>, <i>italic</i>, and <u>underlined</u> text.
        </p>
        <p style={{color: '#1c1c1e'}}>
          Inline <code>code</code> and <mark>highlighted</mark> text.
        </p>
        <p style={{color: '#1c1c1e'}}>
          H<sub>2</sub>O and E=mc<sup>2</sup> with sub and superscripts.
        </p>
      </div>
    </div>
  );
}

module.exports = TextFormatting;
module.exports.default = TextFormatting;
module.exports.fixture = fixture;
