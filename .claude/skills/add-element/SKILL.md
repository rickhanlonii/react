---
name: add-element
description: Checklist for adding a new HTML element to react-dom-native (lockstep file updates)
user_invocable: true
---

## Adding a New HTML Element

Every new element requires updating these files in lockstep:

1. **`ElementDefaults.swift`** — add a static defaults dict + case in `defaults(for:)` switch
2. **`UIKitMutationApplier.swift`** — add to `createView`/`updateView` case list (text elements go in the UILabel case, container elements fall through to the default UIView case)
3. **`HostConfig.js`** — add to `TEXT_CONTEXT_ELEMENTS` Set if the element is inline text (virtual text inside a text container)
4. **Swift tests** (`ElementDefaultsTests.swift`) — verify defaults dict values
5. **JS integration tests** (`element-defaults-itest.js`) — verify end-to-end via Fantom

Reference descriptors with exact values: `docs/research/html-elements/`

## File Locations

- `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`
- `packages/react-dom-native/src/renderer/HostConfig.js`
- `packages/react-dom-native/ios/Tests/ElementDefaultsTests.swift`
- `tests/fantom/element-defaults-itest.js`

## Verify

After adding the element, run:
```bash
npm test && npm run test:swift && npm run test:fantom
```
