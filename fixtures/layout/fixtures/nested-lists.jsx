'use strict';

var React = require('react');

module.exports = function NestedLists() {
  return (
    <div>
      <ul>
        <li>Top-level A</li>
        <li>
          Top-level B
          <ul>
            <li>Nested B.1</li>
            <li>Nested B.2</li>
          </ul>
        </li>
        <li>Top-level C</li>
      </ul>
      <ol>
        <li>First</li>
        <li>
          Second
          <ol>
            <li>Second-A</li>
            <li>Second-B</li>
          </ol>
        </li>
        <li>Third</li>
      </ol>
      <ul>
        <li>
          Mixed parent
          <ol>
            <li>Ordered inside unordered A</li>
            <li>Ordered inside unordered B</li>
          </ol>
        </li>
      </ul>
    </div>
  );
};
