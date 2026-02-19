'use strict';

var React = require('react');

module.exports = function FieldsetLegend() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic fieldset with legend */}
      <fieldset>
        <legend>Personal Info</legend>
        <div style={{marginBottom: 8}}>
          <label>Name</label>
          <input style={{marginLeft: 8}} />
        </div>
        <div>
          <label>Email</label>
          <input style={{marginLeft: 8}} />
        </div>
      </fieldset>

      {/* Fieldset with custom border color */}
      <fieldset style={{borderColor: '#3366cc', marginTop: 16}}>
        <legend>Preferences</legend>
        <p>Option A</p>
        <p>Option B</p>
      </fieldset>

      {/* Fieldset with no legend */}
      <fieldset style={{marginTop: 16}}>
        <p>Fieldset without a legend element.</p>
      </fieldset>

      {/* Nested fieldsets */}
      <fieldset style={{marginTop: 16}}>
        <legend>Outer Group</legend>
        <p>Outer content</p>
        <fieldset style={{marginTop: 8}}>
          <legend>Inner Group</legend>
          <p>Inner content</p>
        </fieldset>
      </fieldset>
    </div>
  );
};
