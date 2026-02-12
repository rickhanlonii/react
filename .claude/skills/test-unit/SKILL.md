---
name: test-unit
description: Run unit tests for a react-dom-native package. Usage: /test-unit renderer
argument-hint: <package-name>
---

# Run Unit Tests

## Arguments

`$ARGUMENTS` — the package name to test (e.g., `renderer`, `components`, `yoga-layout`, `bridge`, `flight-client`)

## Instructions

1. Determine the source path: `packages/react-dom-native/src/$ARGUMENTS/`
2. Check that the package has tests: `packages/react-dom-native/src/$ARGUMENTS/__tests__/`
3. Run the tests:

```bash
cd /Users/rickhanlonii/oss/falcon
npm test -- --testPathPattern="packages/react-dom-native/src/$ARGUMENTS"
```

4. If that doesn't work, run with jest directly:

```bash
npx jest packages/react-dom-native/src/$ARGUMENTS/__tests__/ --verbose
```

5. Report results: number of tests passed/failed, any error output
6. If tests fail, read the failing test and the source code it tests, then suggest fixes
