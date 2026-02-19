'use strict';

var React = require('react');

module.exports = function ArticleContent() {
  return (
    <div style={{width: 390}}>
      <article style={{padding: 16}}>
        <h1>Article Title</h1>
        <p>
          This is an introductory paragraph with <strong>bold</strong> and <em>italic</em> text.
        </p>
        <blockquote>
          <p>A notable quote from someone important.</p>
        </blockquote>
        <p>
          Here is some <code>inline code</code> in a paragraph, followed by a horizontal rule.
        </p>
        <hr />
        <p>
          Final paragraph with a <a>link</a> inside it.
        </p>
      </article>
    </div>
  );
};
