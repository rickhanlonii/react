'use strict';

var React = require('react');

module.exports = function AlignContent() {
  return (
    <div style={{padding: 8}}>
      {/* alignContent: flex-start */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9a54a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6', margin: 4}} />
      </div>

      {/* alignContent: flex-end */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'flex-end',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9a54a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6', margin: 4}} />
      </div>

      {/* alignContent: center */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'center',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9a54a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6', margin: 4}} />
      </div>

      {/* alignContent: space-between */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'space-between',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9a54a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6', margin: 4}} />
      </div>

      {/* alignContent: space-around */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'space-around',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9a54a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6', margin: 4}} />
      </div>

      {/* alignContent: stretch (default) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'stretch',
        width: 374,
        height: 200,
        backgroundColor: '#f0f0f0',
      }}>
        <div style={{width: 80, height: 40, backgroundColor: '#4a90d9', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#5ba55b', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d94a4a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#d9a54a', margin: 4}} />
        <div style={{width: 80, height: 40, backgroundColor: '#9b59b6', margin: 4}} />
      </div>
    </div>
  );
};
