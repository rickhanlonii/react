'use client';

const React = require('react');
const {useState} = React;

const colors = {
  accent: '#007aff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  tabBg: '#e5e5ea',
  tabActive: '#ffffff',
};

function Tabs({tabs}) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: colors.tabBg,
          borderRadius: 8,
          padding: 2,
        }}>
        {tabs.map((tab, index) => (
          <div
            key={tab.label}
            onClick={() => setActiveIndex(index)}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 6,
              backgroundColor:
                index === activeIndex ? colors.tabActive : 'transparent',
              boxShadow:
                index === activeIndex
                  ? {
                      offsetX: 0,
                      offsetY: 1,
                      blurRadius: 2,
                      color: 'rgba(0,0,0,0.1)',
                    }
                  : undefined,
            }}>
            <span
              style={{
                display: 'flex',
                justifyContent: 'center',
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                width: '100%',
                fontSize: 13,
                fontWeight: index === activeIndex ? '600' : '400',
                color: index === activeIndex ? colors.accent : colors.secondary,
                marginTop: 0,
                marginBottom: 0,
              }}>
              {tab.label}
            </span>
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div style={{marginTop: 12}}>
        {tabs[activeIndex].content}
      </div>
    </div>
  );
}

module.exports = Tabs;
module.exports.default = Tabs;
