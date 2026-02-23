'use strict';

var React = require('react');

module.exports = function FlexBasisSizes() {
  return (
    <div style={{width: 390}}>
      {/* flexBasis sets initial size before grow/shrink */}
      <div style={{display: 'flex', flexDirection: 'row'}}>
        <div style={{flexBasis: 100, height: 40, backgroundColor: '#ff9999'}} />
        <div style={{flexBasis: 200, height: 40, backgroundColor: '#99ff99'}} />
      </div>

      {/* flexBasis + flexGrow: grow from different bases */}
      <div style={{display: 'flex', flexDirection: 'row', marginTop: 12}}>
        <div style={{
          flexBasis: 50,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#ffaaaa',
        }} />
        <div style={{
          flexBasis: 150,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#aaffaa',
        }} />
      </div>

      {/* flexBasis 0 + flexGrow: equal distribution regardless of content */}
      <div style={{display: 'flex', flexDirection: 'row', marginTop: 12}}>
        <div style={{
          flexBasis: 0,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#aaaaff',
        }} />
        <div style={{
          flexBasis: 0,
          flexGrow: 2,
          height: 40,
          backgroundColor: '#ffaaff',
        }} />
        <div style={{
          flexBasis: 0,
          flexGrow: 1,
          height: 40,
          backgroundColor: '#aaffff',
        }} />
      </div>

      {/* flexBasis in column direction */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: 150,
        marginTop: 12,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{
          flexBasis: 40,
          backgroundColor: '#ffccaa',
        }} />
        <div style={{
          flexBasis: 60,
          backgroundColor: '#aaccff',
        }} />
        <div style={{
          flexGrow: 1,
          backgroundColor: '#ccffaa',
        }} />
      </div>

      {/* flexBasis vs width: flexBasis takes precedence in flex */}
      <div style={{display: 'flex', flexDirection: 'row', marginTop: 12}}>
        <div style={{
          width: 200,
          flexBasis: 100,
          height: 40,
          backgroundColor: '#ddaa88',
        }} />
        <div style={{
          flexGrow: 1,
          height: 40,
          backgroundColor: '#88aadd',
        }} />
      </div>

      {/* flexBasis + flexShrink: items shrink from basis */}
      <div style={{display: 'flex', flexDirection: 'row', marginTop: 12}}>
        <div style={{
          flexBasis: 250,
          flexShrink: 1,
          height: 40,
          backgroundColor: '#ee9988',
        }} />
        <div style={{
          flexBasis: 250,
          flexShrink: 2,
          height: 40,
          backgroundColor: '#8899ee',
        }} />
      </div>
    </div>
  );
};
