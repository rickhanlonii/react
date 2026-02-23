# CDP Elements Tab: Shadow Tree in Chrome DevTools

## Goal

Populate the Chrome DevTools Elements tab with the native shadow tree, showing HTML element structure, inline styles, and Yoga-computed layout values. This gives developers a familiar DOM inspector experience for debugging layout issues in react-dom-native.

## Approach

Proxy-side DOM/CSS domain handlers forward CDP requests to the app via the existing `cdp-request` mechanism. The app calls Swift bridge functions that walk the shadow tree (`currentTrees`) and read Yoga layout data. Live updates are pushed after each React commit.

## Data Flow

```
DevTools Elements tab
  → CDP request (DOM.getDocument, CSS.getComputedStyleForNode, etc.)
  → Inspector proxy (inspector-proxy.js)
  → cdp-request message via WebSocket
  → App JS handler (DOMAgent.js)
  → Swift bridge function ($$getDocumentTree, $$getComputedStyle, etc.)
  → Walks ShadowNodeWrapper tree / reads YGNodeRef values
  → Response back through the same chain
  → Elements tab renders the tree / styles
```

Live updates:

```
React commit ($$completeRoot)
  → Swift sends $$sendInspectorMessage({type: 'dom-updated'})
  → Proxy receives dom-updated, broadcasts DOM.documentUpdated
  → DevTools re-calls DOM.getDocument to refresh the tree
```

Highlighting:

```
User hovers node in Elements tab
  → DOM.highlightNode(nodeId)
  → Proxy forwards to app → $$highlightNode(nodeId)
  → Swift draws box model overlay on the UIView
  → DOM.hideHighlight → $$hideHighlight() removes overlay
```

## Swift Bridge Functions

Added to `Bindings.swift` (registered alongside existing `$$` functions).

### `$$getDocumentTree(surfaceId)` → DOM.Node tree

Walks `currentTrees[surfaceId]` recursively. For each `ShadowNodeWrapper`, returns:

```js
{
  nodeId: Int,              // from nodeRegistry
  backendNodeId: Int,       // same as nodeId
  nodeType: 1,              // 1=ELEMENT, 3=TEXT, 9=DOCUMENT
  nodeName: "DIV",          // family.elementType uppercased
  localName: "div",         // family.elementType as-is
  nodeValue: "",            // text content for #text nodes, "" for elements
  childNodeCount: 3,
  children: [...],          // recursive (full depth — native trees are small)
  attributes: [             // flat [key, value, key, value, ...] array
    "style", "flex-direction: column; padding: 8px",
    "onClick", "true"
  ]
}
```

The root response wraps this in a `#document` node (nodeType 9) containing a `<body>` node (nodeType 1) whose children are the surface's root nodes.

Props flattening rules:
- `style` dict → CSS-like string (`"color: red; font-size: 16px"`)
- Event handler props (`onClick`, `onChange`) → `"true"` (marker only)
- String/number/boolean props → string value
- Functions and objects (other than style) → omitted

### `$$getComputedStyle(nodeId)` → [{name, value}, ...]

Reads from two sources:

**Yoga layout (YGNodeRef):**
- `width`, `height`, `top`, `left` — from `layoutFrame`
- `margin-top`, `margin-right`, `margin-bottom`, `margin-left` — `YGNodeLayoutGetMargin`
- `padding-top`, `padding-right`, `padding-bottom`, `padding-left` — `YGNodeLayoutGetPadding`
- `border-top-width`, `border-right-width`, `border-bottom-width`, `border-left-width` — `YGNodeLayoutGetBorder`

**Yoga style (YGNodeStyleGet*):**
- `display` — `YGNodeStyleGetDisplay`
- `position` — `YGNodeStyleGetPositionType`
- `flex-direction` — `YGNodeStyleGetFlexDirection`
- `justify-content` — `YGNodeStyleGetJustifyContent`
- `align-items` — `YGNodeStyleGetAlignItems`
- `align-self` — `YGNodeStyleGetAlignSelf`
- `align-content` — `YGNodeStyleGetAlignContent`
- `flex-wrap` — `YGNodeStyleGetFlexWrap`
- `flex-grow` — `YGNodeStyleGetFlexGrow`
- `flex-shrink` — `YGNodeStyleGetFlexShrink`
- `flex-basis` — `YGNodeStyleGetFlexBasis`
- `overflow` — `YGNodeStyleGetOverflow`
- `gap`, `row-gap`, `column-gap` — `YGNodeStyleGetGap`

**Props style dict (visual properties Yoga doesn't track):**
- `color`, `background-color`, `opacity`
- `font-size`, `font-weight`, `font-family`, `font-style`
- `border-radius`, `border-color`, `border-style`
- `text-align`, `text-decoration`, `line-height`

Values formatted as CSS strings: numbers get `"px"` suffix, enums map to CSS keywords (e.g., `YGFlexDirectionColumn` → `"column"`).

### `$$getInlineStyle(nodeId)` → CSSStyle

Returns `props["style"]` formatted as a CDP `CSSStyle`:

```js
{
  cssProperties: [
    {name: "color", value: "red"},
    {name: "padding", value: "8px"},
    ...
  ],
  shorthandEntries: []
}
```

### `$$getOuterHTML(nodeId)` → string

Reconstructs an HTML string from the node type, attributes, and text children. Used for the "Edit as HTML" preview in DevTools.

```html
<div style="flex-direction: column; padding: 8px">
  <p>Hello world</p>
</div>
```

### `$$highlightNode(nodeId)` / `$$hideHighlight()`

1. Look up `ShadowNodeWrapper` from `nodeRegistry[nodeId]`
2. Look up `UIView` from `ViewRegistry` via `node.family`
3. Read box model from Yoga: content (`layoutFrame`), padding (`YGNodeLayoutGetPadding`), border (`YGNodeLayoutGetBorder`), margin (`YGNodeLayoutGetMargin`)
4. Convert frame to root view coordinates
5. Add overlay view with colored regions:
   - Content: `rgba(111, 168, 220, 0.66)` (blue)
   - Padding: `rgba(147, 196, 125, 0.55)` (green)
   - Border: `rgba(255, 229, 153, 0.66)` (yellow)
   - Margin: `rgba(246, 178, 107, 0.66)` (orange)

One highlight active at a time. `$$hideHighlight()` removes the overlay.

## In-App JS Handler: DOMAgent.js

New file: `packages/react-dom-native/src/devtools/DOMAgent.js`

Handles `cdp-request` messages with `domain: 'DOM'` or `domain: 'CSS'`. Routes to the appropriate `$$` bridge function and sends the response back via `$$sendInspectorMessage`.

Registered in `InspectorMessageHandler.js` alongside the existing RuntimeAgent.

## Inspector Proxy Changes

### DOM Domain (`createDOMDomain`)

Replace the current empty stub with a forwarding handler:

| Method | Behavior |
|--------|----------|
| `enable` | Return `{}` |
| `disable` | Return `{}` |
| `getDocument` | Forward to app → `$$getDocumentTree`. Return tree wrapped in `#document` + `<body>`. |
| `requestChildNodes` | No-op return `{}` — full tree returned in `getDocument` |
| `getOuterHTML` | Forward to app → `$$getOuterHTML(nodeId)` |
| `highlightNode` | Forward to app → `$$highlightNode(nodeId)` |
| `highlightRect` | Forward to app → `$$highlightNode` (approximate) |
| `hideHighlight` | Forward to app → `$$hideHighlight()` |
| `querySelector` / `querySelectorAll` | Return empty |

Events:
- `DOM.documentUpdated` — emitted when app sends `{type: 'dom-updated'}` after `$$completeRoot`

Uses the existing `pendingCDPRequests` + `handleAppMessage` pattern from the Runtime domain.

### CSS Domain (`createCSSDomain`) — new

| Method | Behavior |
|--------|----------|
| `enable` | Return `{}` |
| `disable` | Return `{}` |
| `getComputedStyleForNode` | Forward to app → `$$getComputedStyle(nodeId)` |
| `getInlineStylesForNode` | Forward to app → `$$getInlineStyle(nodeId)` |
| `getMatchedStylesForNode` | Forward to app — returns inline style as the single matched rule, empty `matchedCSSRules` array |

### Commit Hook

In `$$completeRoot` (Bindings.swift), after promoting the new tree (`self.currentTrees[surfaceId] = newChildren`), send a notification:

```swift
engine.callGlobalFunction("$$sendInspectorMessage", with: [
    engine.makeObject([
        "type": "dom-updated",
        "surfaceId": surfaceId
    ])
])
```

## Files Changed

| File | Change |
|------|--------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` | Add `$$getDocumentTree`, `$$getComputedStyle`, `$$getInlineStyle`, `$$getOuterHTML`, `$$highlightNode`, `$$hideHighlight`. Add dom-updated notification in `$$completeRoot`. |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/ElementHighlightOverlay.swift` | New — overlay view drawing box model regions |
| `packages/react-dom-native/src/devtools/DOMAgent.js` | New — handles DOM/CSS cdp-request messages |
| `packages/react-dom-native/src/devtools/InspectorMessageHandler.js` | Route DOM/CSS domain requests to DOMAgent |
| `example/scripts/inspector-proxy.js` | Replace DOM stub, add CSS domain, wire up handleAppMessage for dom-updated |

## Not In Scope

- **Style editing** — Changing styles from DevTools (would need React re-render with new props)
- **DOM mutation** — Adding/removing nodes from DevTools
- **CSS cascade** — No real stylesheet rules exist; only inline styles
- **Search** — DOM.performSearch (could add later)
- **Accessibility tree** — DOM.getAccessibilityTree
