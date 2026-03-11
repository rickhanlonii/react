const React = require('react');

const fixture = {
  title: 'Fieldset',
  description: 'Fieldset with legend, grouping related form elements',
  category: 'Forms',
};

function Fieldset() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Fieldset</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Fieldset with legend grouping form elements
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <fieldset>
          <legend>Account Settings</legend>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>
              Fieldset groups related form elements with a border and legend.
            </p>
            <input placeholder="Username" />
            <input placeholder="Email" />
          </div>
        </fieldset>
      </div>
    </div>
  );
}

module.exports = Fieldset;
module.exports.default = Fieldset;
module.exports.fixture = fixture;
