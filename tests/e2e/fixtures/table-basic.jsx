'use strict';

var React = require('react');

module.exports = function TableBasic() {
  return (
    <div style={{width: 390, padding: 10}}>
      <table style={{width: 370}}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Age</th>
            <th>City</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Alice</td>
            <td>30</td>
            <td>New York</td>
          </tr>
          <tr style={{backgroundColor: '#f5f5f5'}}>
            <td>Bob</td>
            <td>25</td>
            <td>London</td>
          </tr>
          <tr>
            <td>Charlie</td>
            <td>35</td>
            <td>Tokyo</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
