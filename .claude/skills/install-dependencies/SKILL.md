---
name: install-dependencies
description: Install all npm and native dependencies. Run this after specs, before any impl skills.
---

# Install Dependencies

## Objective

Install all project dependencies upfront. This skill prompts for approval before each network operation.

## Instructions

### Step 1: Prompt for npm install approval

Ask user: "Ready to install npm dependencies? This will run npm install for:
- Root: jest, @types/jest, typescript, @types/node
- packages/react-dom-native (renderer): react-reconciler, react
- packages/react-dom-native (yoga-layout): (JS bindings only — Yoga itself runs native-side via SPM)
- packages/react-dom-native (flight-client): react-client
- example/scripts: [bundler from /research-bundler], chokidar, ws
- example/server: express, react, react-dom, react-server-dom-esm (if not already installed)

Proceed? [y/n]"

### Step 2: Install npm packages

If approved:
```bash
cd /Users/rickhanlonii/oss/falcon

# Root dev dependencies
npm install --save-dev jest @types/jest typescript @types/node

# Library package
cd packages/react-dom-native && npm install && cd ../..

# Example app
cd example && npm install && cd ..

# Fantom testing framework
cd tools/fantom && npm install && cd ../..
```

### Step 3: Prompt for native dependency setup

Ask user: "Ready to set up native iOS dependencies? This will:
- Initialize Swift Package in packages/react-dom-native/ios/
- Add Yoga C++ as SPM dependency (via SwiftYogaKit or compile from react-native source)
- Configure JavaScriptCore.framework link (built into iOS)

Proceed? [y/n]"

### Step 4: Initialize native dependencies

If approved, this creates the Package.swift scaffold. Full Xcode setup is done by `/impl-xcode-project`.

```bash
mkdir -p /Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ReactDomNativeKit
mkdir -p /Users/rickhanlonii/oss/falcon/packages/react-dom-native/ios/Sources/ShadowTree
mkdir -p /Users/rickhanlonii/oss/falcon/tools/fantom/ios/Sources/FantomTester
```

**Note:** Yoga layout calculations happen on the native side (Swift/C++). The JS `packages/react-dom-native/src/yoga-layout/` package provides bindings to call native Yoga via the bridge, not a standalone JS implementation.

## After Completion

All dependencies are installed. Implementation skills can now run without network access.
