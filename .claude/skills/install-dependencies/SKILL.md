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
- packages/renderer: react-reconciler, react
- packages/yoga-layout: (JS bindings only — Yoga itself runs native-side via SPM)
- packages/flight-client: react-client
- packages/cli: [bundler from /research-bundler], chokidar, ws
- server: next, react, react-dom (if not already installed)

Proceed? [y/n]"

### Step 2: Install npm packages

If approved:
```bash
cd /Users/rickhanlonii/oss/falcon

# Root dev dependencies
npm install --save-dev jest @types/jest typescript @types/node

# Create package dirs if needed
mkdir -p packages/{renderer,yoga-layout,flight-client,cli,bridge,components}/src

# Renderer
cd packages/renderer && npm init -y && npm install react-reconciler react && cd ../..

# Yoga (JS bindings to call native Yoga — no npm yoga package needed)
cd packages/yoga-layout && npm init -y && cd ../..

# Flight client
cd packages/flight-client && npm init -y && npm install react && cd ../..

# Bridge
cd packages/bridge && npm init -y && cd ../..

# Components
cd packages/components && npm init -y && npm install react && cd ../..

# CLI / build tools (bundler determined by /research-bundler)
cd packages/cli && npm init -y && npm install chokidar ws && cd ../..
# Note: Install chosen bundler separately: npm install esbuild|swc|@react-native/metro-config

# Server (if needed)
cd server && npm install && cd ..
```

### Step 3: Prompt for native dependency setup

Ask user: "Ready to set up native iOS dependencies? This will:
- Initialize Swift Package in ios/
- Add Yoga C++ as SPM dependency (via SwiftYogaKit or compile from react-native source)
- Configure JavaScriptCore.framework link (built into iOS)

Proceed? [y/n]"

### Step 4: Initialize native dependencies

If approved, this creates the Package.swift scaffold. Full Xcode setup is done by `/impl-xcode-project`.

```bash
mkdir -p /Users/rickhanlonii/oss/falcon/ios/Sources/ReactDomNative
mkdir -p /Users/rickhanlonii/oss/falcon/ios/Tests/ReactDomNativeTests
```

**Note:** Yoga layout calculations happen on the native side (Swift/C++). The JS `packages/yoga-layout/` package provides bindings to call native Yoga via the bridge, not a standalone JS implementation.

## After Completion

All dependencies are installed. Implementation skills can now run without network access.
