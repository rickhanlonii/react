# Demo Todo App — Design

## Overview

A standalone iOS app that renders a single Todo fixture using react-dom-native. No fixture picker — launches directly into the todo app. A hidden debug menu (Cmd+Shift+D) allows switching between Server Only, Hydrated, and PPR rendering modes.

Hits the same server as the Falcon Demo app (RSC on :6000, SSR on :6001).

## Native App Structure

- **`@main struct DemoApp: App`** — SwiftUI app, same pattern as Falcon
- **`DemoRootView: UIViewControllerRepresentable`** — bridges to `ServerOnlyViewController` / `HydrationViewController` / `PrerenderViewController` based on rendering mode
- **`@AppStorage("renderingMode")`** — persists selected mode, defaults to `"hydrated"`
- On launch, immediately renders the todo fixture — no fixture picker, no navigation stack
- Changing mode uses `.id(renderingMode)` to recreate the ViewController
- Fixture name hardcoded to `"37-demo-todo"`
- Runs on the "Demo" simulator

## Debug Menu

- **Cmd+Shift+D** opens a SwiftUI `.sheet` from the bottom
- Shows three options: Server Only, Hydrated, Partial Prerender — checkmark on current mode
- Selecting a mode updates `@AppStorage("renderingMode")` and dismisses the sheet
- No other native UI chrome — no nav bar, no toolbar. React content fills the full screen.

## Server Fixture (`37-demo-todo.js`)

- **Static shell** (renders immediately, no async): header with title "Todos", subtitle, and `AddTodoForm`
- **Suspense boundary** around the todo list: wraps async `TodoListSection` with ~800ms artificial delay, then renders `TodoAppList` with todos from `getTodos()`
- **Skeleton fallback**: placeholder rows mimicking todo items
- Reuses existing `AddTodoForm`, `TodoAppList` components, and `todo-actions` server actions
- Server actions get ~300ms artificial delay to show pending states
- iOS-native styling: `#f2f2f7` background, white cards with `borderRadius: 12`

### PPR behavior

The header + add form are static → part of the prerender shell. The todo list is dynamic (async + data fetch) → streams in / resumes.

## Xcode Project Setup

- Delete `ContentView.swift`
- Rewrite `DemoApp.swift` with: `RenderingMode` enum, `DemoRootView: UIViewControllerRepresentable`, debug menu sheet
- Copy three ViewControllers into Demo app (they're thin wrappers around ReactDomNativeKit APIs):
  - `HydrationViewController.swift` (~25 lines)
  - `ServerOnlyViewController.swift` (~25 lines)
  - `PrerenderViewController.swift` (~125 lines)
- Add `ReactDomNativeKit` as local SPM dependency (path: `../../packages/react-dom-native/ios`)
- `Info.plist` with `NSAppTransportSecurity` → `NSAllowsLocalNetworking = true`
