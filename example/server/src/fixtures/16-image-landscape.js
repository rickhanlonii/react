const React = require('react');

const fixture = {
  title: 'Landscape Image',
  description: 'Full-width landscape image loaded from a remote URL',
  category: 'Images',
};

function LandscapeImage() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Landscape Image</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Full-width image with 16:9 aspect ratio
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <img src="https://picsum.photos/seed/falcon2/320/180" style={{width: '100%', height: 180, borderRadius: 8}} />
      </div>
    </div>
  );
}

module.exports = LandscapeImage;
module.exports.default = LandscapeImage;
module.exports.fixture = fixture;
