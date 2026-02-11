---
name: impl-xcode-project
description: Create the Xcode project and build the native iOS app. Run after impl-js-bridge.
---

# Implement: Xcode Project

## Objective

Create a working Xcode project that can build and run the react-dom-native iOS app.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `packages/bridge/` Swift files must exist (from impl-js-bridge)
- JS engine decision made (`docs/specs/adr/001-js-engine.md`)

## Instructions

### Step 1: Create Swift Package structure

```
ios/
├── Package.swift
├── Sources/
│   └── ReactDomNative/
│       ├── App.swift              # @main entry point
│       ├── AppDelegate.swift      # UIApplicationDelegate
│       ├── SceneDelegate.swift    # UIWindowSceneDelegate
│       ├── RootViewController.swift
│       ├── JSRuntime.swift        # JavaScriptCore setup
│       └── Bridge/                # Symlink or copy from packages/bridge ios/
├── Resources/
│   └── bundle.js                  # JS bundle (built by build scripts)
└── Tests/
    └── ReactDomNativeTests/
```

### Step 2: Create Package.swift

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReactDomNative",
    platforms: [.iOS(.v15)],
    products: [
        .executable(name: "ReactDomNative", targets: ["ReactDomNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/nicklockwood/SwiftYogaKit.git", from: "1.0.0")
        // Or compile Yoga from source
    ],
    targets: [
        .executableTarget(
            name: "ReactDomNative",
            dependencies: ["SwiftYogaKit"],
            path: "Sources/ReactDomNative",
            resources: [.copy("Resources")]
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNative"]
        )
    ]
)
```

### Step 3: Create App entry point

`App.swift`:
```swift
import SwiftUI

@main
struct ReactDomNativeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

### Step 4: Create JSRuntime

`JSRuntime.swift`:
```swift
import JavaScriptCore

class JSRuntime {
    let context: JSContext

    init() {
        context = JSContext()!
        setupBridge()
        loadBundle()
    }

    private func setupBridge() {
        // Register native functions callable from JS
        context.setObject(BridgeModule.self, forKeyedSubscript: "NativeBridge" as NSString)
    }

    private func loadBundle() {
        guard let bundlePath = Bundle.main.path(forResource: "bundle", ofType: "js"),
              let bundleSource = try? String(contentsOfFile: bundlePath) else {
            fatalError("Could not load bundle.js")
        }
        context.evaluateScript(bundleSource)
    }
}
```

### Step 5: Build and run

```bash
# Build with SPM
cd /Users/rickhanlonii/oss/falcon/ios
swift build

# Or open in Xcode
open Package.swift
# Then: Product → Run (Cmd+R)
```

### Step 6: Create convenience scripts

Create `scripts/build-ios.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/../ios"
swift build -c release
```

Create `scripts/run-ios.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/../ios"
swift run
```

## Output

- `ios/Package.swift`
- `ios/Sources/ReactDomNative/App.swift`
- `ios/Sources/ReactDomNative/AppDelegate.swift`
- `ios/Sources/ReactDomNative/SceneDelegate.swift`
- `ios/Sources/ReactDomNative/RootViewController.swift`
- `ios/Sources/ReactDomNative/JSRuntime.swift`
- `scripts/build-ios.sh`
- `scripts/run-ios.sh`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Xcode project + native app"
