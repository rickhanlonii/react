'use strict';

var React = require('react');

// Tests tabular layout using div+flex (CSS table layout is not supported by Yoga).
// Exercises: flex row layout, equal-width columns, bold headers, alternating
// row backgrounds, cell padding.
module.exports = function TableBasic() {
  var rowStyle = {display: 'flex', flexDirection: 'row'};
  var cellStyle = {flexGrow: 1, flexShrink: 1, flexBasis: 0, padding: 1, fontSize: 16};
  var headerCellStyle = {flexGrow: 1, flexShrink: 1, flexBasis: 0, padding: 1, fontSize: 16, fontWeight: 'bold'};

  return (
    <div style={{width: 390, padding: 10}}>
      <div style={{width: 370}}>
        <div style={rowStyle}>
          <div style={headerCellStyle}>Name</div>
          <div style={headerCellStyle}>Age</div>
          <div style={headerCellStyle}>City</div>
        </div>
        <div style={rowStyle}>
          <div style={cellStyle}>Alice</div>
          <div style={cellStyle}>30</div>
          <div style={cellStyle}>New York</div>
        </div>
        <div style={{display: 'flex', flexDirection: 'row', backgroundColor: '#f5f5f5'}}>
          <div style={cellStyle}>Bob</div>
          <div style={cellStyle}>25</div>
          <div style={cellStyle}>London</div>
        </div>
        <div style={rowStyle}>
          <div style={cellStyle}>Charlie</div>
          <div style={cellStyle}>35</div>
          <div style={cellStyle}>Tokyo</div>
        </div>
      </div>
    </div>
  );
};
