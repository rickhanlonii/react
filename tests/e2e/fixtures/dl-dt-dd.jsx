'use strict';

var React = require('react');

module.exports = function DlDtDd() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic definition list */}
      <dl>
        <dt><strong>HTML</strong></dt>
        <dd>HyperText Markup Language</dd>
        <dt><strong>CSS</strong></dt>
        <dd>Cascading Style Sheets</dd>
        <dt><strong>JS</strong></dt>
        <dd>JavaScript</dd>
      </dl>

      {/* Definition list with custom styling */}
      <dl style={{backgroundColor: '#f9f9f9', padding: 10, marginTop: 16}}>
        <dt style={{color: '#333333', fontWeight: 'bold'}}>Term A</dt>
        <dd style={{color: '#666666'}}>Description for Term A with more detail.</dd>
        <dt style={{color: '#333333', fontWeight: 'bold'}}>Term B</dt>
        <dd style={{color: '#666666'}}>Description for Term B with more detail.</dd>
      </dl>

      {/* Multiple descriptions per term */}
      <dl style={{marginTop: 16}}>
        <dt><strong>React</strong></dt>
        <dd>A JavaScript library for building user interfaces.</dd>
        <dd>Created by Meta (formerly Facebook).</dd>
      </dl>
    </div>
  );
};
