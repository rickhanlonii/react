# Falcon Demo App Prerender + Resume Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a prerender + resume demo route to the Falcon example app that exercises the new server-side `prerender`/`resumeToPipeableStream` APIs end-to-end, from Express server through SSR stream to native UIKit rendering.

**Architecture:** Add a new SSR server endpoint (`/prerender/:name`) that prerenders the component tree at startup, caches the prelude + postponed state, and resumes per-request with dynamic data. The native app calls `hydrateRoot` on the resumed stream. A new fixture demonstrates the flow with a static shell + dynamic Suspense boundaries.

**Tech Stack:** Express, react-dom-native/static, react-dom-native/server, Swift (ReactDomNativeKit)

**Depends on:** `2026-03-02-prerender-resume-server.md` (server-side APIs must be implemented first)

---

### Task 1: Create prerender + resume fixture

**Files:**
- Create: `example/server/src/fixtures/30-prerender-resume.js`

**Step 1: Write fixture component**

Create a fixture with a static shell (header, footer) and dynamic Suspense boundaries (greeting, timestamp) that will be postponed during prerender and filled in during resume.

```js
'use strict';

var React = require('react');

function StaticHeader() {
  return React.createElement('header', {id: 'header', style: {padding: 16, backgroundColor: '#f0f0f0'}},
    React.createElement('h1', null, 'Prerender + Resume Demo'),
    React.createElement('p', null, 'This header was prerendered at build time.'),
  );
}

function DynamicGreeting({userId}) {
  if (userId == null) {
    React.unstable_postpone('waiting for userId');
  }
  return React.createElement('div', {id: 'greeting', style: {padding: 16}},
    'Hello, User #' + userId + '!',
  );
}

function DynamicTimestamp() {
  var now = new Date().toISOString();
  React.unstable_postpone('waiting for request time');
  return React.createElement('div', {id: 'timestamp', style: {padding: 16}},
    'Generated at: ' + now,
  );
}

function StaticFooter() {
  return React.createElement('footer', {id: 'footer', style: {padding: 16, backgroundColor: '#f0f0f0'}},
    React.createElement('p', null, 'Copyright 2026 react-dom-native'),
  );
}

function PrerenderResumeApp({userId}) {
  return React.createElement('div', null,
    React.createElement(StaticHeader),
    React.createElement('div', {style: {padding: 16}},
      React.createElement('p', null, 'Static content that never changes.'),
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'Loading greeting...'),
      }, React.createElement(DynamicGreeting, {userId: userId})),
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'Loading timestamp...'),
      }, React.createElement(DynamicTimestamp)),
    ),
    React.createElement(StaticFooter),
  );
}

module.exports = PrerenderResumeApp;
```

**Step 2: Commit**

```
feat: add prerender-resume fixture for demo app
```

---

### Task 2: Add prerender endpoint to SSR server

**Files:**
- Modify: `example/server/ssr-server.js`

**Step 1: Add prerender cache and endpoint**

Import the static prerender API and add a `/prerender/:name` endpoint that:
1. On first request, prerenders the fixture and caches prelude + postponed
2. On subsequent requests, resumes from cached postponed state with request-time data

Add the prerender endpoint before the existing `/ssr/:name` route.

**Step 2: Commit**

```
feat: add /prerender endpoint to SSR server for prerender+resume demo
```

---

### Task 3: Add prerender fixture to Falcon Demo app menu

**Files:**
- Modify: `example/server/src/App.js` (add fixture to menu)
- Modify: `example/Falcon/` Swift source (add menu entry if fixtures are defined in Swift)

**Step 1: Register the new fixture in the app's fixture list**

Add `30-prerender-resume` to the fixture list so it appears in the demo app's menu. The native app should route to the `/prerender/30-prerender-resume` SSR endpoint instead of the normal `/ssr/` endpoint.

**Step 2: Commit**

```
feat: add prerender-resume fixture to Falcon Demo menu
```

---

### Task 4: Verify end-to-end flow

**Step 1: Start dev servers**

```bash
cd example && npm run dev
```

**Step 2: Test prerender endpoint**

```bash
curl http://localhost:6001/prerender/30-prerender-resume
```

Verify:
- First response prerenders the static shell (header, footer, fallback text)
- Postponed boundaries show fallback content
- Response includes BOOT and R instructions

**Step 3: Test resume on second request**

```bash
curl http://localhost:6001/prerender/30-prerender-resume
```

Verify:
- Response includes dynamic content (greeting, timestamp)
- Static shell is served from cache (faster)

**Step 4: Test in native app**

Build and run the Falcon Demo app, navigate to the prerender-resume fixture, verify:
- Static shell renders instantly
- Dynamic content fills in
- Hydration completes without errors

**Step 5: Commit**

```
feat: prerender + resume demo working end-to-end
```
