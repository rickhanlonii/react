const React = require('react');
const FormControls = require('../components/FormControls');

const fixture = {
  title: 'Contact Form',
  description: 'Interactive form with name, bio, and submit button',
  category: 'Forms',
};

function ContactForm() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Contact Form</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Interactive form with controlled state
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <FormControls />
      </div>
    </div>
  );
}

module.exports = ContactForm;
module.exports.default = ContactForm;
module.exports.fixture = fixture;
