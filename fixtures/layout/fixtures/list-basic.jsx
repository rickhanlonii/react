'use strict';

var React = require('react');

module.exports = function ListBasic() {
  return (
    <div>
      <ul>
        <li>First item</li>
        <li>Second item</li>
        <li>Third item</li>
      </ul>
      <ol>
        <li>One</li>
        <li>Two</li>
        <li>Three</li>
      </ol>
    </div>
  );
};
