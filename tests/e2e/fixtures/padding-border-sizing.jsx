'use strict';

var React = require('react');

module.exports = function PaddingBorderSizing() {
  return (
    <div style={{padding: 8}}>
      {/* Width + padding: total size increases */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 100,
          height: 50,
          backgroundColor: '#4a90d9',
        }} />
        <div style={{
          width: 100,
          height: 50,
          padding: 10,
          backgroundColor: '#5ba55b',
        }} />
        <div style={{
          width: 100,
          height: 50,
          padding: 20,
          backgroundColor: '#d94a4a',
        }} />
      </div>

      {/* Width + border: total size increases */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 100,
          height: 50,
          backgroundColor: '#e8e8e8',
        }} />
        <div style={{
          width: 100,
          height: 50,
          borderWidth: 3,
          borderColor: '#333333',
          backgroundColor: '#e8e8e8',
        }} />
        <div style={{
          width: 100,
          height: 50,
          borderWidth: 8,
          borderColor: '#333333',
          backgroundColor: '#e8e8e8',
        }} />
      </div>

      {/* Width + padding + border combined */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{
          width: 100,
          height: 50,
          backgroundColor: '#fff3cd',
        }} />
        <div style={{
          width: 100,
          height: 50,
          padding: 8,
          borderWidth: 2,
          borderColor: '#e67e22',
          backgroundColor: '#fff3cd',
        }} />
      </div>

      {/* Asymmetric padding affecting layout */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          height: 40,
          paddingLeft: 30,
          paddingRight: 10,
          paddingTop: 5,
          paddingBottom: 15,
          backgroundColor: '#dae8fc',
          borderWidth: 1,
          borderColor: '#4a90d9',
        }}>
          <div style={{fontSize: 12}}>Asymmetric padding</div>
        </div>
      </div>

      {/* Asymmetric border affecting layout */}
      <div style={{
        width: 374,
        backgroundColor: '#f0f0f0',
        padding: 8,
        marginBottom: 8,
      }}>
        <div style={{
          height: 40,
          borderTopWidth: 6,
          borderTopColor: '#d94a4a',
          borderBottomWidth: 2,
          borderBottomColor: '#5ba55b',
          borderLeftWidth: 1,
          borderLeftColor: '#999999',
          borderRightWidth: 4,
          borderRightColor: '#4a90d9',
          backgroundColor: '#f5f0ff',
        }} />
      </div>

      {/* Nested padding accumulation */}
      <div style={{
        width: 374,
        padding: 12,
        backgroundColor: '#e8e8e8',
        marginBottom: 8,
      }}>
        <div style={{
          padding: 12,
          backgroundColor: '#d5e8d4',
        }}>
          <div style={{
            padding: 12,
            backgroundColor: '#b8dab8',
          }}>
            <div style={{height: 30, backgroundColor: '#5ba55b'}} />
          </div>
        </div>
      </div>

      {/* Flex children with different padding+border combos */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        width: 374,
        alignItems: 'flex-start',
      }}>
        <div style={{
          flex: 1,
          padding: 4,
          backgroundColor: '#f8cecc',
        }}>
          <div style={{height: 30, backgroundColor: '#d94a4a'}} />
        </div>
        <div style={{
          flex: 1,
          padding: 12,
          backgroundColor: '#dae8fc',
        }}>
          <div style={{height: 30, backgroundColor: '#4a90d9'}} />
        </div>
        <div style={{
          flex: 1,
          padding: 4,
          borderWidth: 4,
          borderColor: '#5ba55b',
          backgroundColor: '#d5e8d4',
        }}>
          <div style={{height: 30, backgroundColor: '#5ba55b'}} />
        </div>
      </div>
    </div>
  );
};
