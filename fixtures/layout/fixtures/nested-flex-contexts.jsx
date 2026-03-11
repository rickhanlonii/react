'use strict';

var React = require('react');

module.exports = function NestedFlexContexts() {
  return (
    <div style={{width: 390}}>
      {/* Row inside column (default) */}
      <div style={{backgroundColor: '#f0f0f0', padding: 8}}>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <div style={{width: 60, height: 40, backgroundColor: '#ff9999'}} />
          <div style={{width: 60, height: 40, backgroundColor: '#99ff99'}} />
          <div style={{width: 60, height: 40, backgroundColor: '#9999ff'}} />
        </div>
      </div>

      {/* Column inside row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        backgroundColor: '#e8e8e8',
        padding: 8,
      }}>
        <div style={{flexGrow: 1}}>
          <div style={{height: 30, backgroundColor: '#ffaaaa'}} />
          <div style={{height: 30, marginTop: 6, backgroundColor: '#ffcccc'}} />
        </div>
        <div style={{flexGrow: 1}}>
          <div style={{height: 30, backgroundColor: '#aaaaff'}} />
          <div style={{height: 30, marginTop: 6, backgroundColor: '#ccccff'}} />
        </div>
      </div>

      {/* Row inside row (nested horizontal) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        backgroundColor: '#f5f5dc',
        padding: 8,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 4,
          flexGrow: 1,
          backgroundColor: '#eeeeaa',
          padding: 4,
        }}>
          <div style={{width: 30, height: 30, backgroundColor: '#dddd66'}} />
          <div style={{width: 30, height: 30, backgroundColor: '#cccc44'}} />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 4,
          flexGrow: 1,
          backgroundColor: '#aaddaa',
          padding: 4,
        }}>
          <div style={{width: 30, height: 30, backgroundColor: '#66cc66'}} />
          <div style={{width: 30, height: 30, backgroundColor: '#44aa44'}} />
        </div>
      </div>

      {/* Different alignments at each level */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        height: 100,
        backgroundColor: '#f0e0f0',
        padding: 8,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          width: 80,
          backgroundColor: '#e0c0e0',
        }}>
          <div style={{height: 20, backgroundColor: '#cc88cc'}} />
          <div style={{height: 20, marginTop: 4, backgroundColor: '#bb66bb'}} />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: 80,
          backgroundColor: '#c0e0c0',
        }}>
          <div style={{height: 20, backgroundColor: '#88cc88'}} />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          width: 80,
          backgroundColor: '#c0c0e0',
        }}>
          <div style={{height: 20, backgroundColor: '#8888cc'}} />
          <div style={{height: 20, marginTop: 4, backgroundColor: '#6666bb'}} />
        </div>
      </div>

      {/* Three levels deep */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 12,
        backgroundColor: '#e8f0e8',
        padding: 8,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 6,
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flexGrow: 1,
            backgroundColor: '#c0ddc0',
            padding: 4,
          }}>
            <div style={{height: 20, backgroundColor: '#88bb88'}} />
            <div style={{height: 20, backgroundColor: '#66aa66'}} />
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flexGrow: 2,
            backgroundColor: '#ddc0c0',
            padding: 4,
          }}>
            <div style={{height: 20, backgroundColor: '#bb8888'}} />
            <div style={{height: 20, backgroundColor: '#aa6666'}} />
          </div>
        </div>
        <div style={{height: 30, backgroundColor: '#aabbcc'}} />
      </div>
    </div>
  );
};
