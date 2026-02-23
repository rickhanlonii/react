'use strict';

var React = require('react');

module.exports = function PercentageSizes() {
  return (
    <div style={{width: 390}}>
      {/* width as percentage of parent */}
      <div style={{
        width: '100%',
        height: 30,
        backgroundColor: '#ccddff',
      }} />

      <div style={{
        width: '50%',
        height: 30,
        marginTop: 8,
        backgroundColor: '#aabbee',
      }} />

      <div style={{
        width: '25%',
        height: 30,
        marginTop: 8,
        backgroundColor: '#8899dd',
      }} />

      {/* Multiple children with percentage widths in a row */}
      <div style={{display: 'flex', flexDirection: 'row', marginTop: 12}}>
        <div style={{width: '33%', height: 40, backgroundColor: '#ffaaaa'}} />
        <div style={{width: '34%', height: 40, backgroundColor: '#aaffaa'}} />
        <div style={{width: '33%', height: 40, backgroundColor: '#aaaaff'}} />
      </div>

      {/* Percentage height (parent needs explicit height) */}
      <div style={{height: 120, marginTop: 12, backgroundColor: '#f0f0f0'}}>
        <div style={{
          width: 80,
          height: '50%',
          backgroundColor: '#dd99dd',
        }} />
        <div style={{
          width: 80,
          height: '25%',
          backgroundColor: '#bb77bb',
        }} />
      </div>

      {/* Nested percentage: child is 50% of parent which is 50% of root */}
      <div style={{width: '50%', marginTop: 12, backgroundColor: '#eeeedd'}}>
        <div style={{
          width: '50%',
          height: 30,
          backgroundColor: '#ddddaa',
        }} />
      </div>

      {/* minWidth / maxWidth as percentage */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 8, marginTop: 12}}>
        <div style={{
          minWidth: '30%',
          height: 40,
          backgroundColor: '#ffccaa',
        }} />
        <div style={{
          maxWidth: '40%',
          flexGrow: 1,
          height: 40,
          backgroundColor: '#aaccff',
        }} />
      </div>
    </div>
  );
};
