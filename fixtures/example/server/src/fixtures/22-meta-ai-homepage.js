const React = require('react');

const fixture = {
  title: 'Meta AI Homepage',
  description: 'Replica of the meta.ai landing page layout',
  category: 'Full Pages',
  config: {
    hideNavBar: true,
    backgroundColor: '#FFFFFF',
  },
};

function SuggestionItem({title, icon, isFirst}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}>
      {!isFirst && (
        <div
          style={{
            height: 0.5,
            backgroundColor: '#E5E5E5',
            marginLeft: 56,
            marginRight: 14,
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 12,
          paddingRight: 12,
        }}>
        <div
          style={{
            width: 32,
            height: 32,
            marginRight: 12,
            alignItems: 'center',
            justifyContent: 'center',
            display: 'flex',
          }}>
          <span style={{color: '#696B6E', fontSize: 20}}>{icon}</span>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
          <p
            style={{
              color: '#696B6E',
              fontSize: 16,
              marginTop: 0,
              marginBottom: 0,
            }}>
            {title}
          </p>
        </div>
        <span
          style={{color: '#A1A3A7', fontSize: 22, marginLeft: 8, marginRight: 6}}>
          ›
        </span>
      </div>
    </div>
  );
}

function MetaAIHomepage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        minHeight: '100%',
        padding: 0,
      }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingTop: 16,
          paddingRight: 16,
          paddingLeft: 16,
          gap: 8,
        }}>
        <div
          style={{
            backgroundColor: '#5B6ACD',
            borderRadius: 18,
            height: 36,
            paddingLeft: 16,
            paddingRight: 16,
            alignItems: 'center',
            justifyContent: 'center',
            display: 'flex',
          }}>
          <span style={{color: '#FFFFFF', fontSize: 14, fontWeight: '600'}}>
            Log in
          </span>
        </div>
        <div
          style={{
            backgroundColor: '#EBEBEC',
            borderRadius: 18,
            height: 36,
            paddingLeft: 16,
            paddingRight: 16,
            alignItems: 'center',
            justifyContent: 'center',
            display: 'flex',
          }}>
          <span style={{color: '#111112', fontSize: 14, fontWeight: '600'}}>
            Sign Up
          </span>
        </div>
      </div>

      {/* Title area — takes up ~40% of screen, bottom-aligned */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          height: 280,
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 32,
        }}>
        <h1
          style={{
            color: '#111112',
            fontSize: 28,
            fontWeight: '700',
            marginTop: 0,
            marginBottom: 0,
          }}>
          What can I do for you?
        </h1>
      </div>

      {/* Input bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 16,
        }}>
        <div
          style={{
            backgroundColor: '#EBEBEC',
            borderRadius: 24,
            height: 48,
            paddingLeft: 6,
            paddingRight: 6,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          {/* Plus button */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#DDDDE0',
              alignItems: 'center',
              justifyContent: 'center',
              display: 'flex',
            }}>
            <span style={{color: '#111112', fontSize: 22, fontWeight: '300'}}>
              +
            </span>
          </div>
          {/* Placeholder text */}
          <div style={{flex: 1, paddingLeft: 8, paddingRight: 8}}>
            <span style={{color: '#A1A3A7', fontSize: 16}}>
              Ask anything...
            </span>
          </div>
          {/* Send button */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#5B6ACD',
              opacity: 0.5,
              alignItems: 'center',
              justifyContent: 'center',
              display: 'flex',
            }}>
            <span style={{color: '#FFFFFF', fontSize: 18, fontWeight: '700'}}>
              ↑
            </span>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 40,
          paddingTop: 4,
        }}>
        <SuggestionItem
          title={'Create a card that says "good morning"'}
          icon="✦"
          isFirst
        />
        <SuggestionItem title="Optimise my morning routine" icon="☰" />
        <SuggestionItem title="Best places to visit in Europe" icon="⌕" />
        <SuggestionItem
          title="What's a stress management technique I can try?"
          icon="♡"
        />
      </div>
    </div>
  );
}

module.exports = MetaAIHomepage;
module.exports.default = MetaAIHomepage;
module.exports.fixture = fixture;
