'use strict';

var React = require('react');

module.exports = function TableSemantic() {
  return (
    <div style={{width: 390, padding: 10}}>
      {/* Table with caption, thead, tbody */}
      <table style={{width: 370}}>
        <caption>Student Grades</caption>
        <thead>
          <tr style={{backgroundColor: '#e0e0e0'}}>
            <th>Name</th>
            <th>Subject</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Alice</td>
            <td>Math</td>
            <td>A</td>
          </tr>
          <tr style={{backgroundColor: '#f5f5f5'}}>
            <td>Bob</td>
            <td>Science</td>
            <td>B+</td>
          </tr>
          <tr>
            <td>Carol</td>
            <td>English</td>
            <td>A-</td>
          </tr>
        </tbody>
      </table>

      {/* Table with tfoot */}
      <table style={{width: 370, marginTop: 20}}>
        <thead>
          <tr style={{backgroundColor: '#333333'}}>
            <th style={{color: '#ffffff'}}>Item</th>
            <th style={{color: '#ffffff'}}>Price</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Widget</td>
            <td>$10</td>
          </tr>
          <tr>
            <td>Gadget</td>
            <td>$25</td>
          </tr>
        </tbody>
        <tfoot style={{backgroundColor: '#f0f0f0'}}>
          <tr>
            <td style={{fontWeight: 'bold'}}>Total</td>
            <td style={{fontWeight: 'bold'}}>$35</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
