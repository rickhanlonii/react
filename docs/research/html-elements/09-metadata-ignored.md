# Metadata / Ignored Elements

Elements that produce no visual output. These should be completely ignored by the renderer — no shadow node, no UIView, no Yoga node.

## All Metadata Elements — SKIP

```json
[
  {
    "element": "head",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Document head. Contains metadata only. Never rendered."
  },
  {
    "element": "title",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Document title. Sets window/tab title in browser. In native, could set navigation bar title but not rendered as a view."
  },
  {
    "element": "meta",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Document metadata. Charset, viewport, description, etc. No rendering."
  },
  {
    "element": "link",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "External resource link. Stylesheets, favicons, etc. No rendering."
  },
  {
    "element": "style",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Embedded CSS. No rendering. Styles are applied via style prop, not CSS cascade."
  },
  {
    "element": "script",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Embedded or linked JavaScript. No rendering. JS is bundled separately."
  },
  {
    "element": "noscript",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Fallback for no-JS browsers. Always hidden since our environment requires JS."
  },
  {
    "element": "template",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "HTML template. Content not rendered. Used for client-side templating in browsers."
  },
  {
    "element": "slot",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "contents",
    "notes": "Shadow DOM slot. display: contents means children render but the element itself doesn't create a box. Not applicable to React rendering model."
  },
  {
    "element": "base",
    "category": "Metadata",
    "priority": "SKIP",
    "nativeView": "None",
    "browserDisplay": "none",
    "notes": "Base URL for relative URLs. No rendering. URL resolution handled differently in native."
  }
]
```

## Implementation

When the renderer encounters any of these elements, it should:
1. **Not** create a shadow node
2. **Not** create a UIView
3. **Not** allocate a Yoga node
4. Return a no-op instance handle

In `HostConfig.js`, these can be handled in `createInstance` by returning a lightweight stub or in `shouldSetTextContent` / `getChildHostContext` by short-circuiting.

Alternatively, since these elements are typically only used in `<head>` (which itself is skipped), they may never reach the renderer at all in practice. The RSC server would strip them from the Flight stream.
