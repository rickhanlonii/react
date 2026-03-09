---
name: debug
description: Debug the native app with LLDB — attach, set breakpoints, inspect Swift variables, step through code
---

# Native LLDB Debugging

Debug the running iOS app by attaching LLDB, setting breakpoints, and inspecting Swift state.

## Prerequisites

1. **Build server must be running** — debug operations require persistent LLDB state
2. **App must be running** — launch with `npm run app:run` if needed
3. **App must NOT be under Xcode's debugger** — Xcode's debugserver holds an exclusive lock. If the app was launched from Xcode, terminate and relaunch:
   ```
   npm run app:terminate && npm run app:run
   ```

## Workflow

### 1. Attach

```bash
npm run app:debug-attach
```

The build server finds the app's PID via `simctl launchctl list` and attaches Xcode's Swift-aware LLDB. The app resumes automatically after attach.

### 2. Set breakpoints

```bash
# By file and line
npm run app:debug-lldb -- demo "breakpoint set -f UIKitMutationApplier.swift -l 64"

# By function name (Swift mangled)
npm run app:debug-lldb -- demo "breakpoint set -n 'applyMutations'"
```

### 3. Trigger the code path

Use UI automation to interact with the app:
```bash
npm run app:tap -- demo "id:stress-inc-0"
```

### 4. Inspect at breakpoint

```bash
# Check if stopped at breakpoint
npm run app:debug-lldb -- demo "process status"

# Print Swift expressions
npm run app:debug-lldb -- demo "po mutations.count"
npm run app:debug-lldb -- demo "po mutations"

# Backtrace
npm run app:debug-stack

# Frame variables (may be empty at some frames — use `po` instead)
npm run app:debug-variables
```

### 5. Continue / step

```bash
npm run app:debug-lldb -- demo "continue"
npm run app:debug-lldb -- demo "step"
npm run app:debug-lldb -- demo "next"
```

### 6. Clean up

```bash
# Remove breakpoints
npm run app:debug-lldb -- demo "breakpoint delete 1"

# Resume and detach
npm run app:debug-lldb -- demo "continue"
npm run app:debug-detach
```

## Useful breakpoint locations

| File | Line | What it catches |
|------|------|-----------------|
| `UIKitMutationApplier.swift` | 64 | All mutation applications (create, update, insert, remove, delete) |
| `Renderer.swift` | 138 | `commitTree` — shadow tree commit to UIKit |
| `Bindings+Registration.swift` | 702 | JS → Swift bridge call for container operations |

## Troubleshooting

- **"App is being debugged by Xcode"**: `npm run app:terminate && npm run app:run`
- **"App is not running"**: `npm run app:run`
- **`po` returns "Could not find type system for language swift"**: The wrong LLDB is being used. The build server should use `xcrun --find lldb` (Xcode's LLDB with Swift support), not the system LLDB.
- **`frame variable` returns empty**: This is normal at certain Swift frames. Use `po <variable>` instead.
- **Timeout on attach**: Xcode's LLDB may produce different output patterns. Check build server logs.
