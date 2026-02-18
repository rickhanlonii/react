const React = require('react');
const {Suspense} = React;
const Counter = require('./components/Counter');
const TextInput = require('./components/TextInput');

// ── Shared Styles ──

const colors = {
  bg: '#f2f2f7',
  card: '#ffffff',
  accent: '#007aff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  skeleton: '#e5e5ea',
  divider: '#c6c6c8',
};

const card = {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
  boxShadow: {offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.08)'},
  overflow: 'hidden',
  marginTop: 2,
};

// ── Skeleton Placeholders ──

function SkeletonLine({width, height = 14, style}) {
  return (
    <div
      style={{
        backgroundColor: colors.skeleton,
        borderRadius: 7,
        height,
        width: width || '100%',
        ...style,
      }}
    />
  );
}

function CounterSkeleton() {
  return (
    <>
      <SkeletonLine width={120} height={20} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
        }}>
        <div
          style={{
            backgroundColor: colors.skeleton,
            borderRadius: 8,
            width: 36,
            height: 36,
          }}
        />
        <SkeletonLine width={24} height={20} />
        <div
          style={{
            backgroundColor: colors.skeleton,
            borderRadius: 8,
            width: 36,
            height: 36,
          }}
        />
      </div>
    </  >
  );
}

function SearchSkeleton() {
  return (
    <>
      <SkeletonLine width={80} height={20} />
      <div
        style={{
          backgroundColor: colors.skeleton,
          borderRadius: 8,
          height: 36,
          marginTop: 12,
        }}
      />
      <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16}}>
        <SkeletonLine width={'80%'} />
        <SkeletonLine width={'60%'} />
        <SkeletonLine width={'70%'} />
      </div>
    </>
  );
}

// ── Async Server Sections ──

async function CounterSection({delay}) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return (
    <>
      <h3 style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
        Counter
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
        Interactive client component
      </p>
      <Counter initialCount={0} />
    </>
  );
}

async function SearchSection({delay}) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return (
    <>
      <h3 style={{color: colors.text, marginBottom: 0}}>
        Search
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
        Client-side filtering with transitions
      </p>
      <div style={{maxHeight: 250, overflow: 'scroll'}}>
        <TextInput placeholder="Search fruits..." />
      </div>
    </>
  );
}

// ── App ──

function App() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: colors.bg, minHeight: '100%', padding: 16, gap: 16}}>
      {/* Header */}
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: colors.text, marginTop: 0, marginBottom: 4}}>
          Falcon
        </h1>
        <p style={{color: colors.secondary, fontSize: 15, marginTop: 0}}>
          React Server Components on native iOS
        </p>
      </div>

      <div style={card}>
      {/* Counter Card */}
      <Suspense fallback={<CounterSkeleton />}>
        <CounterSection delay={1000} />
      </Suspense>
      </div>

      <div style={card}>
      {/* Search Card */}
      <Suspense fallback={<SearchSkeleton />}>
        <SearchSection delay={2000} />
      </Suspense>
      </div>

      {/* Rich Text Card */}
      <div style={card}>
        <h3 style={{color: colors.text, marginTop: 0, marginBottom: 4}}>
          Rich Text
        </h3>
        <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
          Inline text formatting
        </p>
        <div
          style={{
            height: 1,
            backgroundColor: colors.divider,
            marginTop: 8,
            marginBottom: 12,
          }}
        />
        <p style={{color: colors.text}}>
          This is <b>bold</b>, <i>italic</i>, and <u>underlined</u> text.
        </p>
        <p style={{color: colors.text}}>
          Inline <code>code</code> and <mark>highlighted</mark> text.
        </p>
        <p style={{color: colors.text}}>
          H<sub>2</sub>O and E=mc<sup>2</sup> with sub and superscripts.
        </p>
      </div>

      {/* Footer */}
      <p
        style={{
          color: colors.secondary,
          fontSize: 12,
          textAlign: 'center',
          marginTop: 8,
        }}>
        Built with React, Yoga, and UIKit
      </p>
    </div>
  );
}

module.exports = App;
module.exports.default = App;
