const React = require('react');

const fixture = {
  title: 'Square Image',
  description: 'Single square image loaded from a remote URL',
  category: 'Images',
};

function SquareImage() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Square Image</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          200x200 image with border radius
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <img src="https://picsum.photos/seed/falcon1/200/200" style={{width: 200, height: 200, borderRadius: 8}} />
      </div>
    </div>
  );
}

module.exports = SquareImage;
module.exports.default = SquareImage;
module.exports.fixture = fixture;
