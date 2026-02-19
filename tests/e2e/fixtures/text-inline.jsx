'use strict';

var React = require('react');

module.exports = function TextInline() {
  return (
    <div>
      <p>
        Normal text with <b>bold</b> and <i>italic</i> and <u>underline</u> words.
      </p>
      <p>
        Mixed <strong>strong</strong> and <em>emphasis</em> and <s>strikethrough</s> text.
      </p>
      <p>
        Some <code>inline code</code> in a sentence.
      </p>
    </div>
  );
};
