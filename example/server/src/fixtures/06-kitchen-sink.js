const React = require('react');
const {Suspense} = React;
const Counter = require('../components/Counter');
const TextInput = require('../components/TextInput');
const Tabs = require('../components/Tabs');
const Accordion = require('../components/Accordion');
const TodoList = require('../components/TodoList');
const ErrorBoundary = require('../components/ErrorBoundary');

const fixture = {
  title: 'Kitchen Sink',
  description: 'Full demo — all 5 card sections with Suspense, client components, and rich text',
  category: 'Kitchen Sink',
};

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
    </>
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

function TabsSkeleton() {
  return (
    <>
      <SkeletonLine width={140} height={20} />
      <div
        style={{
          backgroundColor: colors.skeleton,
          borderRadius: 8,
          height: 32,
          marginTop: 12,
        }}
      />
      <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16}}>
        <SkeletonLine width={'90%'} />
        <SkeletonLine width={'60%'} />
      </div>
    </>
  );
}

function AccordionSkeleton() {
  return (
    <>
      <SkeletonLine width={40} height={20} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16}}>
        <SkeletonLine height={20} />
        <SkeletonLine height={20} />
        <SkeletonLine height={20} />
        <SkeletonLine height={20} />
      </div>
    </>
  );
}

function TodoSkeleton() {
  return (
    <>
      <SkeletonLine width={80} height={20} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          marginTop: 12,
        }}>
        <SkeletonLine height={36} style={{flex: 1}} />
        <div
          style={{
            backgroundColor: colors.skeleton,
            borderRadius: 8,
            width: 56,
            height: 36,
          }}
        />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16}}>
        <SkeletonLine width={'85%'} />
        <SkeletonLine width={'70%'} />
        <SkeletonLine width={'60%'} />
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

async function TabsSection({delay}) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return (
    <>
      <h3 style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
        Navigation Tabs
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
        Conditional rendering with state
      </p>
      <Tabs
        tabs={[
          {
            label: 'Overview',
            content: (
              <div>
                <p style={{color: colors.text, marginTop: 0}}>
                  Falcon renders React Server Components natively on iOS using UIKit and Yoga layout.
                </p>
                <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
                  Tap the tabs above to switch content.
                </p>
              </div>
            ),
          },
          {
            label: 'Stack',
            content: (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
                  <b>Server:</b> Next.js + Flight protocol
                </p>
                <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
                  <b>Client:</b> JavaScriptCore
                </p>
                <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
                  <b>Layout:</b> Yoga with web defaults
                </p>
                <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
                  <b>Views:</b> UIKit
                </p>
              </div>
            ),
          },
          {
            label: 'Status',
            content: (
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <div style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#34c759'}} />
                  <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>RSC streaming</p>
                </div>
                <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <div style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#34c759'}} />
                  <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>Client hydration</p>
                </div>
                <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <div style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#34c759'}} />
                  <p style={{color: colors.text, marginTop: 0, marginBottom: 0}}>Interactive events</p>
                </div>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

async function AccordionSection({delay}) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return (
    <>
      <h3 style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
        FAQ
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
        Expandable sections
      </p>
      <Accordion
        items={[
          {
            title: 'What is Falcon?',
            content: (
              <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
                Falcon is a React framework that maps HTML elements to native iOS views using UIKit and Yoga layout.
              </p>
            ),
          },
          {
            title: 'How does RSC work?',
            content: (
              <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
                The server renders React components to a Flight stream, which the native client deserializes and renders using a custom reconciler.
              </p>
            ),
          },
          {
            title: 'What elements are supported?',
            content: (
              <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
                Standard HTML elements like div, span, p, h1-h6, button, input, img, b, i, u, code, mark, sub, sup, and more.
              </p>
            ),
          },
          {
            title: 'Is it production ready?',
            content: (
              <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
                Falcon is an experimental project exploring how React Server Components can power native mobile apps.
              </p>
            ),
          },
        ]}
      />
    </>
  );
}

async function TodoSection({delay}) {
  await new Promise((resolve) => setTimeout(resolve, delay));

  const initialTodos = [
    {id: 1, text: 'Build the renderer', done: true},
    {id: 2, text: 'Add Yoga layout', done: true},
    {id: 3, text: 'Wire up Flight client', done: false},
    {id: 4, text: 'Ship the demo', done: false},
  ];

  return (
    <>
      <h3 style={{color: colors.text, marginTop: 0, marginBottom: 0}}>
        Todo List
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0}}>
        Add, complete, and remove tasks
      </p>
      <TodoList initialTodos={initialTodos} />
    </>
  );
}

// ── App ──
function Throws() {
  throw new Error('Erorr in server component');
}
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
      <ErrorBoundary>
        <Throws />
        <CounterSection delay={1000} />
      </ErrorBoundary>
      </div>

      <div style={card}>
      {/* Search Card */}
      <Suspense fallback={<SearchSkeleton />}>
        <SearchSection delay={2000} />
      </Suspense>
      </div>

      <div style={card}>
      {/* Tabs Card */}
      <Suspense fallback={<TabsSkeleton />}>
        <TabsSection delay={1500} />
      </Suspense>
      </div>

      <div style={card}>
      {/* Accordion Card */}
      <Suspense fallback={<AccordionSkeleton />}>
        <AccordionSection delay={2500} />
      </Suspense>
      </div>

      <div style={card}>
      {/* Todo Card */}
      <Suspense fallback={<TodoSkeleton />}>
        <TodoSection delay={3000} />
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
module.exports.fixture = fixture;
