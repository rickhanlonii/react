const React = require('react');

const fixture = {
  title: 'Image Row',
  description: 'Three images in a horizontal flex row',
  category: 'Images',
};

function ImageRow() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Image Row</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Multiple images in a flex row layout
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <img src="https://picsum.photos/seed/falcon3/100/100" style={{width: 100, height: 100, borderRadius: 8}} />
          <img src="https://picsum.photos/seed/falcon4/100/100" style={{width: 100, height: 100, borderRadius: 8}} />
          <img src="https://picsum.photos/seed/falcon5/100/100" style={{width: 100, height: 100, borderRadius: 8}} />
        </div>
      </div>
    </div>
  );
}

module.exports = ImageRow;
module.exports.default = ImageRow;
module.exports.fixture = fixture;
