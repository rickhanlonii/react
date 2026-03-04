# MPA Form Submit for Server Only Mode

## Goal
Enable server actions (Add, Toggle, Delete) in the Todo App when running in Server Only mode, without booting the JS runtime.

## Approach
MPA-style form submission: user taps submit button -> Swift collects form data -> Swift POSTs to SSR server -> SSR server forwards to Flight server -> Flight server executes action -> Returns new Flight stream -> SSR server renders through Fizz -> Returns new instruction stream -> Swift re-renders page.

## Changes

### Swift (Shadow Tree)
- `ShadowNodeFamily.swift`: Added `formActionData` property to store serialized action data from Fizz `$$FORM_ACTION`

### Swift (UIKit Bindings)
- `UIKitMutationApplier.swift`:
  - Added `ssrBaseURL` property for MPA form POST target
  - Store `_actionData` and `_actionId` from form props during CREATE/UPDATE
  - Modified `handleButtonTap` to try MPA form submit before dispatching JS events
  - Modified `attemptMPAFormSubmit` to handle `action="POST"` by using `ssrBaseURL`
  - Modified `performMPAFormPost` to merge action data with user form fields

### Swift (SSR)
- `Root+SSR.swift`:
  - Set `ssrBaseURL` and `onMPAFormResponse` in `startServerOnly()`
  - Implemented `reloadFromSSRResponse()` to re-render from a new SSR instruction stream

### JS (Server)
- `server.js` (Flight server):
  - Added `express.urlencoded` body parser
  - Implemented MPA form POST handler using `decodeAction` to decode form data, execute the action, and re-render the fixture as a Flight stream
- `ssr-server.js` (SSR server):
  - Added `require.cache` busting in `__webpack_require__` for dev reload
  - Replaced broken POST handler (was trying to use `react-server-dom-webpack/server` without `--conditions react-server`)
  - New POST handler forwards form data to Flight server, then renders returned Flight stream through Fizz via `handleSSRFromFlightStream()`
- `todo-actions.js`: Handle both `FormData.get()` and plain object property access for `addTodo`

### JSX (Components)
- `TodoAppItem.jsx`: Replaced `useTransition` + `onClick` pattern with `<form action={action}>` + `<button type="submit">` for MPA compatibility

### Tests
- Updated `server-actions.test.js`: Changed test for MPA form POST from expecting 501 to expecting 200

## Architecture
```
User taps submit button
  -> handleButtonTap (UIKitMutationApplier.swift)
  -> attemptMPAFormSubmit: finds parent <form>, collects form data + action data
  -> performMPAFormPost: POST to ssrBaseURL (e.g. http://localhost:6001/ssr/32-todo-app)
  -> SSR server forwards to Flight server (POST /fixtures/32-todo-app)
  -> Flight server: decodeAction -> execute action -> re-render fixture as Flight stream
  -> SSR server: render Flight stream through Fizz -> instruction stream
  -> onMPAFormResponse callback
  -> reloadFromSSRResponse: clear views, create fresh SSR infrastructure, feed data
  -> Page re-renders with updated state
```

## Status
Complete. All three operations (Add, Toggle, Delete) verified working in Server Only mode.
