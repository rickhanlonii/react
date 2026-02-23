'use strict';

var React = require('react');

module.exports = function AlignSelfAllValues() {
  return (
    <div style={{padding: 10}}>
      {/* Row: all alignSelf values */}
      <div style={{flexDirection: 'row', height: 100, backgroundColor: '#eeeeee', marginBottom: 10}}>
        <div style={{width: 40, alignSelf: 'auto', backgroundColor: '#4a90d9', padding: 4}}>
          <span style={{fontSize: 10, color: '#ffffff'}}>auto</span>
        </div>
        <div style={{width: 40, alignSelf: 'flex-start', backgroundColor: '#50c878', padding: 4}}>
          <span style={{fontSize: 10, color: '#ffffff'}}>start</span>
        </div>
        <div style={{width: 40, alignSelf: 'flex-end', backgroundColor: '#e74c3c', padding: 4}}>
          <span style={{fontSize: 10, color: '#ffffff'}}>end</span>
        </div>
        <div style={{width: 40, alignSelf: 'center', backgroundColor: '#f39c12', padding: 4}}>
          <span style={{fontSize: 10, color: '#ffffff'}}>center</span>
        </div>
        <div style={{width: 40, alignSelf: 'stretch', backgroundColor: '#9b59b6', padding: 4}}>
          <span style={{fontSize: 10, color: '#ffffff'}}>stretch</span>
        </div>
      </div>

      {/* Column: all alignSelf values */}
      <div style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
        <div style={{flex: 1, height: 200, backgroundColor: '#dddddd'}}>
          <div style={{height: 30, alignSelf: 'auto', backgroundColor: '#4a90d9', padding: 4}}>
            <span style={{fontSize: 10, color: '#ffffff'}}>auto</span>
          </div>
          <div style={{height: 30, alignSelf: 'flex-start', backgroundColor: '#50c878', padding: 4}}>
            <span style={{fontSize: 10, color: '#ffffff'}}>start</span>
          </div>
          <div style={{height: 30, alignSelf: 'flex-end', backgroundColor: '#e74c3c', padding: 4}}>
            <span style={{fontSize: 10, color: '#ffffff'}}>end</span>
          </div>
          <div style={{height: 30, alignSelf: 'center', backgroundColor: '#f39c12', padding: 4}}>
            <span style={{fontSize: 10, color: '#ffffff'}}>center</span>
          </div>
          <div style={{height: 30, alignSelf: 'stretch', backgroundColor: '#9b59b6', padding: 4}}>
            <span style={{fontSize: 10, color: '#ffffff'}}>stretch</span>
          </div>
        </div>
      </div>

      {/* alignSelf override with parent alignItems center */}
      <div style={{flexDirection: 'row', height: 80, alignItems: 'center', backgroundColor: '#eeeeee', marginBottom: 10, gap: 6}}>
        <div style={{width: 50, height: 30, backgroundColor: '#4a90d9'}}>
          <span style={{fontSize: 9, color: '#ffffff'}}>center</span>
        </div>
        <div style={{width: 50, alignSelf: 'flex-start', height: 30, backgroundColor: '#50c878'}}>
          <span style={{fontSize: 9, color: '#ffffff'}}>self:start</span>
        </div>
        <div style={{width: 50, alignSelf: 'flex-end', height: 30, backgroundColor: '#e74c3c'}}>
          <span style={{fontSize: 9, color: '#ffffff'}}>self:end</span>
        </div>
        <div style={{width: 50, alignSelf: 'stretch', backgroundColor: '#f39c12'}}>
          <span style={{fontSize: 9, color: '#ffffff'}}>self:stretch</span>
        </div>
      </div>

      {/* alignSelf stretch with explicit height (height wins) */}
      <div style={{flexDirection: 'row', height: 80, backgroundColor: '#dddddd', gap: 6}}>
        <div style={{width: 60, alignSelf: 'stretch', backgroundColor: '#4a90d9', padding: 4}}>
          <span style={{fontSize: 9, color: '#ffffff'}}>stretch</span>
        </div>
        <div style={{width: 60, alignSelf: 'stretch', height: 30, backgroundColor: '#50c878', padding: 4}}>
          <span style={{fontSize: 9, color: '#ffffff'}}>stretch+h</span>
        </div>
      </div>
    </div>
  );
};
