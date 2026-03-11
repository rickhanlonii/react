'use strict';

var React = require('react');

module.exports = function BlockquoteFigure() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Basic blockquote */}
      <blockquote>
        <p>The only way to do great work is to love what you do.</p>
      </blockquote>

      {/* Styled blockquote */}
      <blockquote style={{
        borderLeftWidth: 4,
        borderLeftColor: '#3366cc',
        backgroundColor: '#f0f4ff',
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 16,
        paddingRight: 16,
        marginLeft: 0,
        marginRight: 0,
      }}>
        <p style={{fontStyle: 'italic', color: '#333333'}}>
          Innovation distinguishes between a leader and a follower.
        </p>
      </blockquote>

      {/* Figure with figcaption */}
      <figure>
        <div style={{
          width: 200,
          height: 120,
          backgroundColor: '#ccddee',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <p style={{color: '#666666'}}>[Image placeholder]</p>
        </div>
        <figcaption>
          <p style={{fontSize: 14, color: '#888888'}}>Figure 1: A placeholder image</p>
        </figcaption>
      </figure>

      {/* Figure with styled figcaption */}
      <figure style={{marginLeft: 0, marginRight: 0, marginTop: 16}}>
        <div style={{
          width: '100%',
          height: 80,
          backgroundColor: '#eeddcc',
        }} />
        <figcaption>
          <p style={{fontSize: 12, color: '#999999', textAlign: 'center'}}>
            Figure 2: Full-width placeholder with centered caption
          </p>
        </figcaption>
      </figure>
    </div>
  );
};
