const React = require('react');
const {Suspense} = React;
const Counter = require('../components/Counter');
const Tabs = require('../components/Tabs');
const TextInput = require('../components/TextInput');
const TodoList = require('../components/TodoList');
const ErrorBoundary = require('../components/ErrorBoundary');
const {getTodos, updateTodos} = require('../actions/todo-actions');
const TodoApp = require('../components/TodoApp');

const fixture = {
  title: 'Demo Showcase',
  description:
    'Technical demo — streaming RSC, Suspense hydration, useTransition, server actions, error boundaries',
  category: 'Full Pages',
};

const colors = {
  bg: '#f2f2f7',
  card: '#ffffff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  skeleton: '#e5e5ea',
  divider: '#c6c6c8',
  accent: '#007aff',
  green: '#34c759',
  red: '#ff3b30',
};

const card = {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
  boxShadow: {offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.08)'},
};

function SkeletonBox({width, height, style}) {
  return (
    <div
      style={{
        backgroundColor: colors.skeleton,
        borderRadius: 7,
        width: width || '100%',
        height: height || 14,
        ...style,
      }}
    />
  );
}

function CardSkeleton({lines = 3}) {
  return (
    <div style={card}>
      <SkeletonBox width={140} height={20} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12}}>
        {Array.from({length: lines}, (_, i) => (
          <SkeletonBox key={i} width={i === lines - 1 ? '60%' : '90%'} />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({children}) {
  return (
    <p style={{fontSize: 11, fontWeight: '600', color: colors.secondary, marginTop: 0, marginBottom: 0, letterSpacing: 0.5}}>
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────
// Section 1: Async Server Components + Streaming
// Shows: async/await in server components, Suspense streaming via Flight protocol
// ─────────────────────────────────────────────

async function AsyncDataSection() {
  // Simulates a database query or API call on the server
  await new Promise(resolve => setTimeout(resolve, 500));

  const serverTimestamp = new Date().toLocaleTimeString();

  return (
    <div style={card}>
      <SectionLabel>ASYNC SERVER COMPONENT</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Server-rendered data
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        This component is <code>async</code> — it awaited a 500ms delay on the server.
        The timestamp below was computed server-side:
      </p>
      <div style={{backgroundColor: colors.bg, borderRadius: 8, padding: 12}}>
        <p style={{color: colors.text, fontSize: 14, fontFamily: 'Menlo', marginTop: 0, marginBottom: 0}}>
          {serverTimestamp}
        </p>
      </div>
      <p style={{color: colors.secondary, fontSize: 12, marginTop: 8, marginBottom: 0}}>
        This section streamed in over Flight while the rest of the page was already visible.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 2: Nested Suspense boundaries
// Shows: Independent Suspense boundaries resolving at different times
// ─────────────────────────────────────────────

async function SlowData({label, delay}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <div style={{width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green}} />
      <p style={{color: colors.text, fontSize: 14, marginTop: 0, marginBottom: 0}}>
        {label} — resolved after {delay}ms
      </p>
    </div>
  );
}

function StreamingSection() {
  return (
    <div style={card}>
      <SectionLabel>SUSPENSE STREAMING</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Independent boundaries
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        Each row is a separate Suspense boundary. They resolve independently as
        Flight chunks arrive — no waterfall.
      </p>
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        <Suspense fallback={<SkeletonBox height={20} width={'70%'} />}>
          <SlowData label="Query A" delay={800} />
        </Suspense>
        <Suspense fallback={<SkeletonBox height={20} width={'60%'} />}>
          <SlowData label="Query B" delay={1200} />
        </Suspense>
        <Suspense fallback={<SkeletonBox height={20} width={'65%'} />}>
          <SlowData label="Query C" delay={1800} />
        </Suspense>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 3: Client component hydration
// Shows: 'use client' boundary, useState, onClick, hydration
// ─────────────────────────────────────────────

async function HydrationSection() {
  await new Promise(resolve => setTimeout(resolve, 600));
  return (
    <div style={card}>
      <SectionLabel>CLIENT COMPONENT HYDRATION</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Counter
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        Marked <code>'use client'</code> — server-rendered, then hydrated.
        The useEffect increments on mount to prove hydration ran.
        Tap buttons to verify onClick works through the native event bridge.
      </p>
      <Counter initialCount={0} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 4: useTransition + Suspense (concurrent features)
// Shows: Non-blocking transitions, manual Suspense with promise cache
// ─────────────────────────────────────────────

async function TransitionSection() {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return (
    <div style={card}>
      <SectionLabel>useTransition + SUSPENSE</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Search with transitions
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        Input uses <code>startTransition</code> to wrap the search state update.
        Results use a manual Suspense cache (throw promise pattern).
        The list dims via <code>isPending</code> opacity while the transition is in flight.
      </p>
      <div style={{maxHeight: 200, overflow: 'scroll'}}>
        <TextInput placeholder="Type to search..." />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 5: Server Actions with useActionState
// Shows: 'use server' functions, form submission, server re-render
// ─────────────────────────────────────────────

async function ServerActionsSection() {
  await new Promise(resolve => setTimeout(resolve, 1400));

  const todos = getTodos();

  return (
    <div style={card}>
      <SectionLabel>SERVER ACTIONS</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Todo list with useActionState
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        <code>addTodo</code> is a <code>'use server'</code> function.
        The form uses <code>useActionState</code> — dispatches to the server action,
        receives the result, and triggers a server re-render of this component tree.
        Toggle and delete use <code>useOptimistic</code> for instant feedback.
      </p>
      <TodoApp
        initialTodos={todos}
        updateTodos={updateTodos}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 6: Error Boundary
// Shows: Server component throwing, ErrorBoundary catching, E row in Flight
// ─────────────────────────────────────────────

function ThrowingServerComponent() {
  throw new Error('Intentional server error — caught by ErrorBoundary');
}

async function ErrorBoundarySection() {
  await new Promise(resolve => setTimeout(resolve, 300));
  return (
    <div style={card}>
      <SectionLabel>ERROR BOUNDARY</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Server error recovery
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        The component below throws during server render.
        Fizz captures it and sends an E row in the Flight stream.
        The client-side ErrorBoundary renders the fallback.
      </p>
      <ErrorBoundary>
        <ThrowingServerComponent />
      </ErrorBoundary>
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 7: Server → Client composition
// Shows: Server components passing serialized props to client components
// ─────────────────────────────────────────────

async function CompositionSection() {
  await new Promise(resolve => setTimeout(resolve, 1600));

  // Server computes the tab content — client component receives it as serialized props
  const tabs = [
    {
      label: 'Server Data',
      content: (
        <div>
          <p style={{color: colors.text, fontSize: 14, marginTop: 0, marginBottom: 0}}>
            This tab content is a <b>server component tree</b> serialized as a Flight reference
            and passed as a prop to the client-side Tabs component.
          </p>
        </div>
      ),
    },
    {
      label: 'Nested Client',
      content: (
        <div>
          <p style={{color: colors.text, fontSize: 14, marginTop: 0, marginBottom: 8}}>
            Client components can nest inside server-provided content.
            This counter hydrates inside a server-rendered tab:
          </p>
          <Counter initialCount={10} />
        </div>
      ),
    },
    {
      label: 'Rich Text',
      content: (
        <div>
          <p style={{color: colors.text, fontSize: 14, marginTop: 0, marginBottom: 4}}>
            Full inline formatting — <b>bold</b>, <i>italic</i>, <u>underline</u>,
            <s>strikethrough</s>, <code>code</code>, <mark>mark</mark>,
            H<sub>2</sub>O, E=mc<sup>2</sup>
          </p>
          <p style={{color: colors.secondary, fontSize: 12, marginTop: 4, marginBottom: 0}}>
            Each maps to a native attributed string range on UILabel.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div style={card}>
      <SectionLabel>SERVER → CLIENT COMPOSITION</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Tabs with server-provided content
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        <code>Tabs</code> is <code>'use client'</code>, but its <code>content</code> props
        are server component trees — serialized as Flight references and deserialized on the
        client. React elements cross the server/client boundary.
      </p>
      <Tabs tabs={tabs} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 8: Native layout capabilities
// Shows: Yoga flexbox, gap, boxShadow, borderRadius, overflow scroll, images
// ─────────────────────────────────────────────

async function LayoutSection() {
  await new Promise(resolve => setTimeout(resolve, 1900));
  return (
    <div style={card}>
      <SectionLabel>YOGA LAYOUT + NATIVE STYLING</SectionLabel>
      <h3 style={{color: colors.text, marginTop: 4, marginBottom: 4}}>
        Flexbox, shadows, images, scroll
      </h3>
      <p style={{color: colors.secondary, fontSize: 13, marginTop: 0, marginBottom: 12}}>
        All layout via Yoga with web-compatible defaults.
        Styling maps to UIKit: boxShadow → CALayer, borderRadius → cornerRadius,
        overflow:scroll → UIScrollView.
      </p>

      {/* Flex row with images */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 8, marginBottom: 12}}>
        <div style={{flex: 1, borderRadius: 8, overflow: 'hidden'}}>
          <img
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=200&fit=crop"
            style={{width: '100%', height: 80}}
          />
        </div>
        <div style={{flex: 1, borderRadius: 8, overflow: 'hidden'}}>
          <img
            src="https://images.unsplash.com/photo-1557683316-973673baf926?w=400&h=200&fit=crop"
            style={{width: '100%', height: 80}}
          />
        </div>
      </div>

      {/* Nested flex layout */}
      <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
        <div
          style={{
            flex: 1,
            padding: 12,
            backgroundColor: colors.bg,
            borderRadius: 8,
            boxShadow: {offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(0,0,0,0.1)'},
          }}>
          <p style={{fontSize: 12, fontWeight: '600', color: colors.accent, marginTop: 0, marginBottom: 2}}>
            flexDirection
          </p>
          <p style={{fontSize: 11, color: colors.secondary, marginTop: 0, marginBottom: 0}}>
            row / column
          </p>
        </div>
        <div
          style={{
            flex: 1,
            padding: 12,
            backgroundColor: colors.bg,
            borderRadius: 8,
            boxShadow: {offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(0,0,0,0.1)'},
          }}>
          <p style={{fontSize: 12, fontWeight: '600', color: colors.green, marginTop: 0, marginBottom: 2}}>
            gap
          </p>
          <p style={{fontSize: 11, color: colors.secondary, marginTop: 0, marginBottom: 0}}>
            row / column
          </p>
        </div>
        <div
          style={{
            flex: 1,
            padding: 12,
            backgroundColor: colors.bg,
            borderRadius: 8,
            boxShadow: {offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(0,0,0,0.1)'},
          }}>
          <p style={{fontSize: 12, fontWeight: '600', color: colors.red, marginTop: 0, marginBottom: 2}}>
            overflow
          </p>
          <p style={{fontSize: 11, color: colors.secondary, marginTop: 0, marginBottom: 0}}>
            scroll / hidden
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.bg,
        minHeight: '100%',
        padding: 16,
        gap: 12,
      }}>
      {/* Header */}
      <div style={{paddingTop: 48, paddingBottom: 4}}>
        <h1 style={{color: colors.text, marginTop: 0, marginBottom: 2}}>
          react-dom-native
        </h1>
        <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
          React Server Components → UIKit via Yoga
        </p>
      </div>

      {/* Error boundary — fast, shows error recovery */}
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <ErrorBoundarySection />
      </Suspense>

      {/* Async server component */}
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <AsyncDataSection />
      </Suspense>

      {/* Streaming boundaries */}
      <StreamingSection />

      {/* Client hydration */}
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <HydrationSection />
      </Suspense>

      {/* useTransition + Suspense */}
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <TransitionSection />
      </Suspense>

      {/* Server Actions */}
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <ServerActionsSection />
      </Suspense>

      {/* Server → Client composition */}
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <CompositionSection />
      </Suspense>

      {/* Layout + styling */}
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <LayoutSection />
      </Suspense>

      <p style={{color: colors.secondary, fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 24}}>
        Persistent-mode reconciler · Flight + Fizz · Yoga · UIKit · JavaScriptCore
      </p>
    </div>
  );
}

module.exports = App;
module.exports.default = App;
module.exports.fixture = fixture;
