const React = require('react');

const fixture = {
  title: 'Button Variants',
  description: 'Default, styled, and disabled-looking buttons',
  category: 'Forms',
};

function ButtonVariants() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Button Variants</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Different button styles
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          <button>Default Button</button>
          <button style={{backgroundColor: '#007aff', color: '#ffffff', borderRadius: 8, padding: 12}}>
            Styled Button
          </button>
          <button style={{backgroundColor: '#e5e5ea', color: '#8e8e93', borderRadius: 8, padding: 12}}>
            Disabled-looking Button
          </button>
        </div>
      </div>
    </div>
  );
}

module.exports = ButtonVariants;
module.exports.default = ButtonVariants;
module.exports.fixture = fixture;
