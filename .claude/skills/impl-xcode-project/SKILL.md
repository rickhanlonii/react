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
- `packages/react-dom-native/src/bridge/` and `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/` Swift files must exist (from impl-js-bridge)
- JS engine decision made (`docs/specs/adr/001-js-engine.md`)

## Instructions

### Step 1: Create Swift Package structure

The library Swift Package lives at `packages/react-dom-native/ios/`. The example app Xcode project lives at `example/Falcon/`.

```
packages/react-dom-native/ios/
├── Package.swift
├── Sources/
│   └── ReactDomNativeKit/
│       ├── JSRuntime.swift        # JavaScriptCore setup
│       └── Bridge/                # Bridge Swift code
├── Resources/
│   └── bundle.js                  # JS bundle (built by build scripts)
└── Tests/
    └── ReactDomNativeTests/

example/Falcon/
├── Falcon.xcodeproj
├── App.swift              # @main entry point
├── AppDelegate.swift      # UIApplicationDelegate
├── SceneDelegate.swift    # UIWindowSceneDelegate
└── RootViewController.swift
```

### Step 2: Create Package.swift

Create at `packages/react-dom-native/ios/Package.swift`:

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReactDomNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "ReactDomNativeKit", targets: ["ReactDomNativeKit"])
    ],
    dependencies: [
        .package(url: "https://github.com/nicklockwood/SwiftYogaKit.git", from: "1.0.0")
        // Or compile Yoga from source
    ],
    targets: [
        .target(
            name: "ReactDomNativeKit",
            dependencies: ["SwiftYogaKit"],
            path: "Sources/ReactDomNativeKit",
            resources: [.copy("Resources")]
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNativeKit"]
        )
    ]
)
```

### Step 3: Create App entry point

`example/Falcon/App.swift`:
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

`packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`:
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
# Build the library with SPM
cd /Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios
swift build

# Open the example Falcon app in Xcode
open /Users/rickhanlonii/oss/falcon/example/Falcon/Falcon.xcodeproj
# Then: Product → Run (Cmd+R)
```

### Step 6: Create convenience scripts

Create `example/scripts/build-ios.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/../../packages/react-dom-native/ios"
swift build -c release
```

Create `example/scripts/run-ios.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/../Falcon"
xcodebuild -scheme Falcon -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Output

- `packages/react-dom-native/ios/Package.swift`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`
- `example/Falcon/Falcon.xcodeproj`
- `example/Falcon/App.swift`
- `example/Falcon/AppDelegate.swift`
- `example/Falcon/SceneDelegate.swift`
- `example/Falcon/RootViewController.swift`
- `example/scripts/build-ios.sh`
- `example/scripts/run-ios.sh`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Xcode project + native app"
