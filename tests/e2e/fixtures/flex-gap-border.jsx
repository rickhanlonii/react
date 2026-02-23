'use strict';

var React = require('react');

module.exports = function FlexGapBorder() {
  return (
    <div style={{padding: 8}}>
      {/* Gap between bordered items in row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#dae8fc',
          borderWidth: 2,
          borderColor: '#4a90d9',
        }} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#d5e8d4',
          borderWidth: 2,
          borderColor: '#5ba55b',
        }} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#f8cecc',
          borderWidth: 2,
          borderColor: '#d94a4a',
        }} />
      </div>

      {/* Gap 0 with borders — borders touch */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 0,
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#dae8fc',
          borderWidth: 2,
          borderColor: '#4a90d9',
        }} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#d5e8d4',
          borderWidth: 2,
          borderColor: '#5ba55b',
        }} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#f8cecc',
          borderWidth: 2,
          borderColor: '#d94a4a',
        }} />
      </div>

      {/* Gap in column with bordered items */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 374,
        backgroundColor: '#fff3cd',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          height: 35,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e67e22',
          borderRadius: 4,
          padding: 8,
        }}>
          <div style={{fontSize: 12}}>Item with border</div>
        </div>
        <div style={{
          height: 35,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e67e22',
          borderRadius: 4,
          padding: 8,
        }}>
          <div style={{fontSize: 12}}>Item with border</div>
        </div>
        <div style={{
          height: 35,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e67e22',
          borderRadius: 4,
          padding: 8,
        }}>
          <div style={{fontSize: 12}}>Item with border</div>
        </div>
      </div>

      {/* Different border widths affecting alignment with gap */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#f5f0ff',
        padding: 8,
        marginBottom: 8,
        alignItems: 'center',
      }}>
        <div style={{
          flex: 1,
          height: 40,
          borderWidth: 1,
          borderColor: '#9b59b6',
          backgroundColor: '#f5f0ff',
        }} />
        <div style={{
          flex: 1,
          height: 40,
          borderWidth: 4,
          borderColor: '#9b59b6',
          backgroundColor: '#f5f0ff',
        }} />
        <div style={{
          flex: 1,
          height: 40,
          borderWidth: 8,
          borderColor: '#9b59b6',
          backgroundColor: '#f5f0ff',
        }} />
      </div>

      {/* Gap with mixed bordered and non-bordered items */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        backgroundColor: '#e8e8e8',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{flex: 1, height: 40, backgroundColor: '#4a90d9'}} />
        <div style={{
          flex: 1,
          height: 40,
          backgroundColor: '#ffffff',
          borderWidth: 3,
          borderColor: '#333333',
        }} />
        <div style={{flex: 1, height: 40, backgroundColor: '#d94a4a'}} />
      </div>

      {/* Gap with border + padding on items */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        width: 374,
        backgroundColor: '#d5e8d4',
        padding: 8,
      }}>
        <div style={{
          flex: 1,
          padding: 8,
          borderWidth: 2,
          borderColor: '#5ba55b',
          backgroundColor: '#ffffff',
          borderRadius: 4,
        }}>
          <div style={{height: 25, backgroundColor: '#5ba55b', borderRadius: 2}} />
        </div>
        <div style={{
          flex: 1,
          padding: 8,
          borderWidth: 2,
          borderColor: '#27ae60',
          backgroundColor: '#ffffff',
          borderRadius: 4,
        }}>
          <div style={{height: 25, backgroundColor: '#27ae60', borderRadius: 2}} />
        </div>
      </div>
    </div>
  );
};
