'use strict';

var React = require('react');

module.exports = function AlignBaseline() {
  return (
    <div style={{padding: 8}}>
      {/* baseline alignment with different font sizes */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{fontSize: 12, backgroundColor: '#4a90d9', color: '#ffffff', padding: 4, margin: 0}}>Small</p>
        <p style={{fontSize: 24, backgroundColor: '#5ba55b', color: '#ffffff', padding: 4, margin: 0}}>Medium</p>
        <p style={{fontSize: 36, backgroundColor: '#d94a4a', color: '#ffffff', padding: 4, margin: 0}}>Large</p>
      </div>

      {/* baseline with different padding */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{fontSize: 16, paddingTop: 4, paddingBottom: 4, backgroundColor: '#4a90d9', color: '#ffffff', margin: 0}}>Pad 4</p>
        <p style={{fontSize: 16, paddingTop: 16, paddingBottom: 16, backgroundColor: '#5ba55b', color: '#ffffff', margin: 0}}>Pad 16</p>
        <p style={{fontSize: 16, paddingTop: 32, paddingBottom: 32, backgroundColor: '#d94a4a', color: '#ffffff', margin: 0}}>Pad 32</p>
      </div>

      {/* baseline vs flex-start comparison container */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: 374,
        backgroundColor: '#eeeeee',
        padding: 8,
        marginBottom: 8,
      }}>
        <p style={{fontSize: 12, backgroundColor: '#9b59b6', color: '#ffffff', padding: 4, margin: 0}}>Start 12</p>
        <p style={{fontSize: 24, backgroundColor: '#e67e22', color: '#ffffff', padding: 4, margin: 0}}>Start 24</p>
        <p style={{fontSize: 36, backgroundColor: '#1abc9c', color: '#ffffff', padding: 4, margin: 0}}>Start 36</p>
      </div>

      {/* baseline with mixed elements */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <h3 style={{margin: 0, backgroundColor: '#4a90d9', color: '#ffffff', padding: 4}}>Heading</h3>
        <p style={{margin: 0, backgroundColor: '#5ba55b', color: '#ffffff', padding: 4}}>Paragraph</p>
        <div style={{backgroundColor: '#d94a4a', padding: 4}}>
          <p style={{margin: 0, fontSize: 10, color: '#ffffff'}}>Nested</p>
        </div>
      </div>

      {/* baseline with height differences */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
      }}>
        <div style={{height: 60, width: 60, backgroundColor: '#4a90d9'}}>
          <p style={{margin: 0, fontSize: 14, color: '#ffffff'}}>Tall</p>
        </div>
        <div style={{height: 40, width: 60, backgroundColor: '#5ba55b'}}>
          <p style={{margin: 0, fontSize: 14, color: '#ffffff'}}>Mid</p>
        </div>
        <div style={{height: 80, width: 60, backgroundColor: '#d94a4a'}}>
          <p style={{margin: 0, fontSize: 14, color: '#ffffff'}}>Taller</p>
        </div>
      </div>
    </div>
  );
};
