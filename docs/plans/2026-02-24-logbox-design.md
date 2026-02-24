# LogBox Design

Native Swift implementation of LogBox for react-dom-native. Displays all errors in the app including JS exceptions, console errors/warnings, React render errors, and dev server build errors.

## Architecture

Centralized Swift error routing. JS is a thin pass-through — the `console` object is injected natively from Swift at JSContext creation, and React error callbacks call simple bridge globals. All routing logic (LogBox display, CDP forwarding, Xcode console logging) lives in Swift.

### Error Flow

```
console.error("msg")        → Swift-injected console.error
                             → LogBox.addEntry(.error, ...)
                             → CDP: Runtime.consoleAPICalled
                             → print() to Xcode console

React onUncaughtError        → $$nativeOnUncaughtError(msg, stack)
                             → LogBox.addEntry(.fatalError, ...)
                             → CDP: Runtime.exceptionThrown
                             → print() to Xcode console

JS exception                 → JSContext.exceptionHandler (Swift)
                             → LogBox.addEntry(.fatalError, ...)
                             → CDP: Runtime.exceptionThrown
                             → print() to Xcode console

Dev server build error       → HotReloadClient WebSocket
                             → LogBox.addEntry(.fatalError, ...)

React onCaughtError          → $$nativeOnCaughtError(msg, stack)
                             → LogBox.addEntry(.error, ...)

React onRecoverableError     → $$nativeOnRecoverableError(msg, stack)
                             → LogBox.addEntry(.warning, ...)
```

## Data Model

```swift
struct LogBoxEntry {
    enum Level { case error, warning, fatalError }
    enum Source { case jsException, consoleError, consoleWarning,
                      rendererUncaught, rendererCaught, rendererRecoverable,
                      devServerError, nativeError }

    let id: UUID
    let level: Level
    let source: Source
    let message: String
    let stack: String?
    let file: String?
    let line: Int?
    let timestamp: Date
    var isRead: Bool = false
}
```

### LogBoxStore

In-memory array of `LogBoxEntry` values. Notifies UI on changes via closure callback. Methods: `addEntry`, `markRead`, `dismiss`, `clearAll`.

## Error Sources

| Source | JS Hook | Swift Entry Point | LogBox Level |
|--------|---------|-------------------|-------------|
| Uncaught JS exception | `JSContext.exceptionHandler` | Direct Swift call | `.fatalError` |
| `console.error()` | Swift-injected `console` | `handleConsole(level:args:)` | `.error` |
| `console.warn()` | Swift-injected `console` | `handleConsole(level:args:)` | `.warning` |
| React `onUncaughtError` | `$$nativeOnUncaughtError` | Bridge global | `.fatalError` |
| React `onCaughtError` | `$$nativeOnCaughtError` | Bridge global | `.error` |
| React `onRecoverableError` | `$$nativeOnRecoverableError` | Bridge global | `.warning` |
| Dev server build error | HotReloadClient WebSocket | `LogBox.addEntry()` | `.fatalError` |
| Native Swift error | Direct Swift call | `LogBox.addEntry()` | `.error` |

## UI Components

All UIKit, all `#if DEBUG` only. Single `UIWindow` at `windowLevel = .alert + 1`.

### LogBoxBadge

Floating red circle in bottom-right corner. Shows unread error count. Red for errors/fatal, yellow for warnings-only. Draggable to reposition. Tap opens LogBoxList. Hidden when no entries.

### LogBoxList

Full-screen modal overlay. Scrollable list of all entries. Each row shows: level icon, source label, first line of message, timestamp. Tap row opens LogBoxDetail. "Clear All" button. Dismiss (X) button returns to badge.

### LogBoxDetail

Full-screen overlay pushed from list. Full error message (scrollable). Stack trace with file/line highlighting. Source label. Prev/next navigation arrows. "Dismiss" removes entry, "Dismiss All" clears everything. Back button returns to list.

### Auto-Expand Behavior

Fatal errors (uncaught JS exceptions, React `onUncaughtError`, dev server errors) automatically expand to LogBoxDetail. Non-fatal errors and warnings only increment the badge.

## Console Injection

The `console` object is injected from Swift during JSContext creation, before any JS bundle is evaluated. This captures all console calls from the first line of JS.

```swift
// In JavaScriptCoreEngine.swift, during context setup
let console = JSValue(newObjectIn: context)
for level in ["log", "info", "debug", "warn", "error"] {
    let block: @convention(block) (JSValue) -> Void = { [weak self] args in
        self?.handleConsole(level: level, args: args)
    }
    console.setObject(block, forKeyedSubscript: level as NSString)
}
context.setObject(console, forKeyedSubscript: "console" as NSString)
```

The `handleConsole` method routes to:
1. LogBox (for `warn` and `error` levels)
2. CDP forwarding (`Runtime.consoleAPICalled` to dev server WebSocket)
3. Xcode console (`print()`)

## File Changes

### Delete
- `ConsoleForwarding.js` — replaced by Swift-injected console
- `ExceptionReporter.js` — replaced by Swift exception handler routing
- `ErrorOverlay.swift` — replaced by LogBox

### New Swift Files
- `LogBox.swift` — singleton coordinator, LogBoxStore, error routing
- `LogBoxBadge.swift` — floating badge view
- `LogBoxListView.swift` — error list overlay
- `LogBoxDetailView.swift` — single error detail view

### Modified
- `JavaScriptCoreEngine.swift` — inject `console` object natively
- `JSRuntime.swift` — wire exception handler to LogBox instead of print
- `ReactRuntime.swift` — initialize LogBox, register React error bridge globals (`$$nativeOnUncaughtError`, `$$nativeOnCaughtError`, `$$nativeOnRecoverableError`)
- `HotReloadClient.swift` — route dev server errors to LogBox instead of ErrorOverlay
- `renderer.js` — React error callbacks call bridge globals instead of console.error
- `entry.js` — remove ConsoleForwarding/ExceptionReporter setup

## Scope

Initial implementation covers: error collection from all sources, floating badge, list view, detail view with stack traces, and auto-expand for fatal errors.

Not in scope: source map resolution, ignore patterns, error grouping/deduplication, component stack traces.

## Dev-Only Guard

All LogBox code is wrapped in `#if DEBUG`. In release builds, the bridge globals are not registered and console calls to `$$nativeOn*` are no-ops. The Swift-injected console still routes to `print()` in release but skips LogBox and CDP.
