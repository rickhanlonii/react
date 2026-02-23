# CDP Elements Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Populate the Chrome DevTools Elements tab with the native shadow tree, showing element structure, inline styles, and Yoga-computed layout values.

**Architecture:** Proxy-side DOM/CSS domain handlers forward CDP requests to the app via the existing `cdp-request` mechanism. A new `DOMAgent.js` in the app handles DOM/CSS domain requests by calling Swift bridge functions (`$$getDocumentTree`, `$$getComputedStyle`, etc.) that walk the shadow tree and read Yoga layout data. Live updates push `DOM.documentUpdated` after each React commit.

**Tech Stack:** Swift (Bindings.swift, Yoga C API), JavaScript (DOMAgent.js, inspector-proxy.js), CDP DOM/CSS domains

**Design doc:** `docs/plans/2026-02-23-cdp-elements-tab-design.md`

---

### Task 1: Swift bridge — `$$getDocumentTree`

Serialize the shadow tree into CDP DOM.Node format.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add the `registerElementsInspector()` method and wire it into `registerBindingFunctions()`**

Add a new section at the end of Bindings.swift (before the closing `}`), and add a call to it in `registerBindingFunctions()`:

```swift
// In registerBindingFunctions() (line 317), add after registerDevTools():
registerElementsInspector()
```

```swift
// MARK: - Elements Inspector (CDP DOM/CSS)

private func registerElementsInspector() {
    // $$getDocumentTree(surfaceId) -> DOM.Node tree
    // Walks currentTrees[surfaceId] and serializes each ShadowNodeWrapper
    // into CDP DOM.Node format for the Chrome DevTools Elements tab.
    engine.setGlobalFunction("$$getDocumentTree") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        let surfaceId = engine.toInt(args[0]) ?? 1

        guard let children = self.currentTrees[surfaceId] else {
            return self.makeEmptyDocument(engine: engine)
        }

        // Build body children
        var bodyChildren: [JSValueRef] = []
        for child in children {
            if let jsNode = self.serializeNode(child, engine: engine) {
                bodyChildren.append(jsNode)
            }
        }

        // <body> node wrapping all root children
        let bodyNode = engine.makeObject()
        engine.setProperty(bodyNode, "nodeId", engine.makeNumber(Double(self.nextInspectorNodeId())))
        engine.setProperty(bodyNode, "backendNodeId", engine.makeNumber(Double(self.nextInspectorNodeId())))
        engine.setProperty(bodyNode, "nodeType", engine.makeNumber(1))
        engine.setProperty(bodyNode, "nodeName", engine.makeString("BODY"))
        engine.setProperty(bodyNode, "localName", engine.makeString("body"))
        engine.setProperty(bodyNode, "nodeValue", engine.makeString(""))
        engine.setProperty(bodyNode, "childNodeCount", engine.makeNumber(Double(bodyChildren.count)))
        engine.setProperty(bodyNode, "children", engine.makeArray(bodyChildren))
        engine.setProperty(bodyNode, "attributes", engine.makeArray([]))

        // #document root
        let doc = engine.makeObject()
        engine.setProperty(doc, "nodeId", engine.makeNumber(Double(self.nextInspectorNodeId())))
        engine.setProperty(doc, "backendNodeId", engine.makeNumber(Double(self.nextInspectorNodeId())))
        engine.setProperty(doc, "nodeType", engine.makeNumber(9))
        engine.setProperty(doc, "nodeName", engine.makeString("#document"))
        engine.setProperty(doc, "localName", engine.makeString(""))
        engine.setProperty(doc, "nodeValue", engine.makeString(""))
        engine.setProperty(doc, "childNodeCount", engine.makeNumber(1))
        engine.setProperty(doc, "children", engine.makeArray([bodyNode]))
        engine.setProperty(doc, "documentURL", engine.makeString("falcon://app"))
        engine.setProperty(doc, "baseURL", engine.makeString("falcon://app"))
        engine.setProperty(doc, "xmlVersion", engine.makeString(""))

        let result = engine.makeObject()
        engine.setProperty(result, "root", doc)
        return result
    }
}

/// Counter for inspector-specific node IDs (document, body wrapper nodes).
/// Shadow tree nodes use their nodeRegistry IDs directly.
private var inspectorNodeIdCounter = 900000

private func nextInspectorNodeId() -> Int {
    inspectorNodeIdCounter += 1
    return inspectorNodeIdCounter
}

private func makeEmptyDocument(engine: JSEngine) -> JSValueRef {
    let doc = engine.makeObject()
    engine.setProperty(doc, "nodeId", engine.makeNumber(1))
    engine.setProperty(doc, "backendNodeId", engine.makeNumber(1))
    engine.setProperty(doc, "nodeType", engine.makeNumber(9))
    engine.setProperty(doc, "nodeName", engine.makeString("#document"))
    engine.setProperty(doc, "localName", engine.makeString(""))
    engine.setProperty(doc, "nodeValue", engine.makeString(""))
    engine.setProperty(doc, "childNodeCount", engine.makeNumber(0))
    engine.setProperty(doc, "children", engine.makeArray([]))
    engine.setProperty(doc, "documentURL", engine.makeString("falcon://app"))
    engine.setProperty(doc, "baseURL", engine.makeString("falcon://app"))
    engine.setProperty(doc, "xmlVersion", engine.makeString(""))
    let result = engine.makeObject()
    engine.setProperty(result, "root", doc)
    return result
}

/// Recursively serializes a ShadowNodeWrapper into CDP DOM.Node format.
private func serializeNode(_ node: ShadowNodeWrapper, engine: JSEngine) -> JSValueRef? {
    let elementType = node.family.elementType

    // Find this node's registry ID (reverse lookup)
    var nodeId = 0
    for (id, registeredNode) in nodeRegistry where registeredNode === node {
        nodeId = id
        break
    }
    if nodeId == 0 {
        nodeId = registerNode(node)
    }

    let jsNode = engine.makeObject()
    engine.setProperty(jsNode, "nodeId", engine.makeNumber(Double(nodeId)))
    engine.setProperty(jsNode, "backendNodeId", engine.makeNumber(Double(nodeId)))

    if elementType == "#text" {
        // Text node
        engine.setProperty(jsNode, "nodeType", engine.makeNumber(3))
        engine.setProperty(jsNode, "nodeName", engine.makeString("#text"))
        engine.setProperty(jsNode, "localName", engine.makeString(""))
        engine.setProperty(jsNode, "nodeValue", engine.makeString(node.text ?? ""))
        engine.setProperty(jsNode, "childNodeCount", engine.makeNumber(0))
        engine.setProperty(jsNode, "children", engine.makeArray([]))
    } else {
        // Element node
        engine.setProperty(jsNode, "nodeType", engine.makeNumber(1))
        engine.setProperty(jsNode, "nodeName", engine.makeString(elementType.uppercased()))
        engine.setProperty(jsNode, "localName", engine.makeString(elementType))
        engine.setProperty(jsNode, "nodeValue", engine.makeString(""))

        // Serialize attributes as flat [key, value, key, value, ...] array
        var attrs: [JSValueRef] = []
        for (key, value) in node.props {
            if key == "style" {
                if let styleDict = value as? [String: Any] {
                    let cssString = self.styleDictToCSS(styleDict)
                    if !cssString.isEmpty {
                        attrs.append(engine.makeString("style"))
                        attrs.append(engine.makeString(cssString))
                    }
                }
            } else if key == "children" || key == "instanceHandle" {
                continue
            } else if value is NSNull {
                continue
            } else if let fn = value as? AnyObject, "\(type(of: fn))".contains("Function") {
                // Event handler — show as boolean marker
                attrs.append(engine.makeString(key))
                attrs.append(engine.makeString("true"))
            } else {
                attrs.append(engine.makeString(key))
                attrs.append(engine.makeString("\(value)"))
            }
        }
        engine.setProperty(jsNode, "attributes", engine.makeArray(attrs))

        // Serialize children recursively
        var childNodes: [JSValueRef] = []
        for child in node.children {
            if let jsChild = self.serializeNode(child, engine: engine) {
                childNodes.append(jsChild)
            }
        }
        engine.setProperty(jsNode, "childNodeCount", engine.makeNumber(Double(childNodes.count)))
        engine.setProperty(jsNode, "children", engine.makeArray(childNodes))
    }

    return jsNode
}

/// Converts a style dictionary to a CSS-like string.
private func styleDictToCSS(_ style: [String: Any]) -> String {
    var parts: [String] = []
    for (key, value) in style.sorted(by: { $0.key < $1.key }) {
        let cssKey = camelToKebab(key)
        if let num = value as? NSNumber {
            // Unitless properties
            let unitless: Set<String> = [
                "opacity", "flex-grow", "flex-shrink", "z-index",
                "font-weight", "line-height", "order"
            ]
            if unitless.contains(cssKey) {
                parts.append("\(cssKey): \(num)")
            } else {
                parts.append("\(cssKey): \(num)px")
            }
        } else {
            parts.append("\(cssKey): \(value)")
        }
    }
    return parts.joined(separator: "; ")
}

/// Converts camelCase to kebab-case (e.g., "fontSize" → "font-size").
private func camelToKebab(_ str: String) -> String {
    var result = ""
    for char in str {
        if char.isUppercase {
            result += "-"
            result += char.lowercased()
        } else {
            result += String(char)
        }
    }
    return result
}
```

**Step 2: Build and verify**

Run: `npm run test:swift`
Expected: existing tests pass (no behavioral change)

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "feat(devtools): add $$getDocumentTree bridge for CDP Elements tab"
```

---

### Task 2: Swift bridge — `$$getComputedStyle`

Read Yoga layout values and style props, return as computed CSS properties.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add `$$getComputedStyle` to `registerElementsInspector()`**

Add inside `registerElementsInspector()`, after the `$$getDocumentTree` registration:

```swift
    // $$getComputedStyle(nodeId) -> {computedStyle: [{name, value}, ...]}
    // Reads Yoga computed layout values and visual style props.
    engine.setGlobalFunction("$$getComputedStyle") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        guard let nodeId = engine.toInt(args[0]),
              let node = self.nodeRegistry[nodeId] else {
            return engine.makeObject()
        }

        var properties: [(String, String)] = []
        let yoga = node.yogaNode

        // Layout computed values
        let frame = node.layoutFrame
        properties.append(("width", "\(frame.width)px"))
        properties.append(("height", "\(frame.height)px"))
        properties.append(("top", "\(frame.origin.y)px"))
        properties.append(("left", "\(frame.origin.x)px"))

        // Box model — margins
        let marginTop = YGNodeLayoutGetMargin(yoga, .top)
        let marginRight = YGNodeLayoutGetMargin(yoga, .right)
        let marginBottom = YGNodeLayoutGetMargin(yoga, .bottom)
        let marginLeft = YGNodeLayoutGetMargin(yoga, .left)
        properties.append(("margin-top", self.formatPx(marginTop)))
        properties.append(("margin-right", self.formatPx(marginRight)))
        properties.append(("margin-bottom", self.formatPx(marginBottom)))
        properties.append(("margin-left", self.formatPx(marginLeft)))

        // Box model — padding
        let paddingTop = YGNodeLayoutGetPadding(yoga, .top)
        let paddingRight = YGNodeLayoutGetPadding(yoga, .right)
        let paddingBottom = YGNodeLayoutGetPadding(yoga, .bottom)
        let paddingLeft = YGNodeLayoutGetPadding(yoga, .left)
        properties.append(("padding-top", self.formatPx(paddingTop)))
        properties.append(("padding-right", self.formatPx(paddingRight)))
        properties.append(("padding-bottom", self.formatPx(paddingBottom)))
        properties.append(("padding-left", self.formatPx(paddingLeft)))

        // Box model — border
        let borderTop = YGNodeLayoutGetBorder(yoga, .top)
        let borderRight = YGNodeLayoutGetBorder(yoga, .right)
        let borderBottom = YGNodeLayoutGetBorder(yoga, .bottom)
        let borderLeft = YGNodeLayoutGetBorder(yoga, .left)
        properties.append(("border-top-width", self.formatPx(borderTop)))
        properties.append(("border-right-width", self.formatPx(borderRight)))
        properties.append(("border-bottom-width", self.formatPx(borderBottom)))
        properties.append(("border-left-width", self.formatPx(borderLeft)))

        // Yoga style enum values
        properties.append(("display", self.displayToString(YGNodeStyleGetDisplay(yoga))))
        properties.append(("position", self.positionToString(YGNodeStyleGetPositionType(yoga))))
        properties.append(("flex-direction", self.flexDirectionToString(YGNodeStyleGetFlexDirection(yoga))))
        properties.append(("justify-content", self.justifyToString(YGNodeStyleGetJustifyContent(yoga))))
        properties.append(("align-items", self.alignToString(YGNodeStyleGetAlignItems(yoga))))
        properties.append(("align-self", self.alignToString(YGNodeStyleGetAlignSelf(yoga))))
        properties.append(("align-content", self.alignToString(YGNodeStyleGetAlignContent(yoga))))
        properties.append(("flex-wrap", self.flexWrapToString(YGNodeStyleGetFlexWrap(yoga))))
        properties.append(("overflow", self.overflowToString(YGNodeStyleGetOverflow(yoga))))

        // Yoga numeric style values
        let flexGrow = YGNodeStyleGetFlexGrow(yoga)
        properties.append(("flex-grow", "\(flexGrow)"))
        let flexShrink = YGNodeStyleGetFlexShrink(yoga)
        properties.append(("flex-shrink", "\(flexShrink)"))
        let flexBasis = YGNodeStyleGetFlexBasis(yoga)
        properties.append(("flex-basis", self.formatYGValue(flexBasis)))

        let gap = YGNodeStyleGetGap(yoga, .all)
        if !gap.isNaN { properties.append(("gap", self.formatPx(gap))) }
        let rowGap = YGNodeStyleGetGap(yoga, .row)
        if !rowGap.isNaN { properties.append(("row-gap", self.formatPx(rowGap))) }
        let columnGap = YGNodeStyleGetGap(yoga, .column)
        if !columnGap.isNaN { properties.append(("column-gap", self.formatPx(columnGap))) }

        // Visual properties from style dict
        let style = node.props["style"] as? [String: Any] ?? [:]
        let visualKeys = [
            "color", "backgroundColor", "opacity",
            "fontSize", "fontWeight", "fontFamily", "fontStyle",
            "borderRadius", "borderColor", "borderStyle",
            "textAlign", "textDecoration", "lineHeight"
        ]
        for key in visualKeys {
            if let val = style[key] {
                let cssKey = self.camelToKebab(key)
                if let num = val as? NSNumber {
                    let unitless: Set<String> = ["opacity", "font-weight", "line-height"]
                    if unitless.contains(cssKey) {
                        properties.append((cssKey, "\(num)"))
                    } else {
                        properties.append((cssKey, "\(num)px"))
                    }
                } else {
                    properties.append((cssKey, "\(val)"))
                }
            }
        }

        // Serialize as CDP computedStyle array
        var jsProps: [JSValueRef] = []
        for (name, value) in properties {
            let prop = engine.makeObject()
            engine.setProperty(prop, "name", engine.makeString(name))
            engine.setProperty(prop, "value", engine.makeString(value))
            jsProps.append(prop)
        }

        let result = engine.makeObject()
        engine.setProperty(result, "computedStyle", engine.makeArray(jsProps))
        return result
    }
```

**Step 2: Add Yoga enum-to-string helper methods**

Add as private methods on Bindings (alongside `camelToKebab`):

```swift
private func formatPx(_ value: Float) -> String {
    if value.isNaN { return "0px" }
    if value == Float(Int(value)) { return "\(Int(value))px" }
    return String(format: "%.1fpx", value)
}

private func formatYGValue(_ value: YGValue) -> String {
    switch value.unit {
    case .point: return formatPx(value.value)
    case .percent: return "\(value.value)%"
    case .auto: return "auto"
    default: return "auto"
    }
}

private func displayToString(_ display: YGDisplay) -> String {
    switch display {
    case .flex: return "flex"
    case .block: return "block"
    case .none: return "none"
    case .inlineBlock: return "inline-block"
    default: return "flex"
    }
}

private func positionToString(_ position: YGPositionType) -> String {
    switch position {
    case .relative: return "relative"
    case .absolute: return "absolute"
    case .static: return "static"
    default: return "relative"
    }
}

private func flexDirectionToString(_ dir: YGFlexDirection) -> String {
    switch dir {
    case .row: return "row"
    case .column: return "column"
    case .rowReverse: return "row-reverse"
    case .columnReverse: return "column-reverse"
    default: return "column"
    }
}

private func justifyToString(_ justify: YGJustify) -> String {
    switch justify {
    case .flexStart: return "flex-start"
    case .center: return "center"
    case .flexEnd: return "flex-end"
    case .spaceBetween: return "space-between"
    case .spaceAround: return "space-around"
    case .spaceEvenly: return "space-evenly"
    default: return "flex-start"
    }
}

private func alignToString(_ align: YGAlign) -> String {
    switch align {
    case .auto: return "auto"
    case .flexStart: return "flex-start"
    case .center: return "center"
    case .flexEnd: return "flex-end"
    case .stretch: return "stretch"
    case .baseline: return "baseline"
    case .spaceBetween: return "space-between"
    case .spaceAround: return "space-around"
    default: return "stretch"
    }
}

private func flexWrapToString(_ wrap: YGWrap) -> String {
    switch wrap {
    case .noWrap: return "nowrap"
    case .wrap: return "wrap"
    case .wrapReverse: return "wrap-reverse"
    default: return "nowrap"
    }
}

private func overflowToString(_ overflow: YGOverflow) -> String {
    switch overflow {
    case .visible: return "visible"
    case .hidden: return "hidden"
    case .scroll: return "scroll"
    default: return "visible"
    }
}
```

**Step 3: Build and verify**

Run: `npm run test:swift`
Expected: existing tests pass

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "feat(devtools): add $$getComputedStyle bridge for Yoga layout inspection"
```

---

### Task 3: Swift bridge — `$$getInlineStyle` and `$$getOuterHTML`

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add `$$getInlineStyle` to `registerElementsInspector()`**

```swift
    // $$getInlineStyle(nodeId) -> {cssProperties: [{name, value}, ...], shorthandEntries: []}
    // Returns the node's props.style as a CDP CSSStyle object.
    engine.setGlobalFunction("$$getInlineStyle") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        guard let nodeId = engine.toInt(args[0]),
              let node = self.nodeRegistry[nodeId] else {
            return engine.makeObject()
        }

        let style = node.props["style"] as? [String: Any] ?? [:]
        var cssProps: [JSValueRef] = []
        for (key, value) in style.sorted(by: { $0.key < $1.key }) {
            let prop = engine.makeObject()
            let cssKey = self.camelToKebab(key)
            engine.setProperty(prop, "name", engine.makeString(cssKey))
            if let num = value as? NSNumber {
                let unitless: Set<String> = [
                    "opacity", "flex-grow", "flex-shrink", "z-index",
                    "font-weight", "line-height", "order"
                ]
                if unitless.contains(cssKey) {
                    engine.setProperty(prop, "value", engine.makeString("\(num)"))
                } else {
                    engine.setProperty(prop, "value", engine.makeString("\(num)px"))
                }
            } else {
                engine.setProperty(prop, "value", engine.makeString("\(value)"))
            }
            cssProps.append(prop)
        }

        let result = engine.makeObject()
        engine.setProperty(result, "cssProperties", engine.makeArray(cssProps))
        engine.setProperty(result, "shorthandEntries", engine.makeArray([]))
        return result
    }
```

**Step 2: Add `$$getOuterHTML` to `registerElementsInspector()`**

```swift
    // $$getOuterHTML(nodeId) -> {outerHTML: "<div ...>...</div>"}
    // Reconstructs HTML from the shadow node for DevTools preview.
    engine.setGlobalFunction("$$getOuterHTML") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        guard let nodeId = engine.toInt(args[0]),
              let node = self.nodeRegistry[nodeId] else {
            let result = engine.makeObject()
            engine.setProperty(result, "outerHTML", engine.makeString(""))
            return result
        }

        let html = self.nodeToHTML(node)
        let result = engine.makeObject()
        engine.setProperty(result, "outerHTML", engine.makeString(html))
        return result
    }
```

Add the `nodeToHTML` helper:

```swift
private func nodeToHTML(_ node: ShadowNodeWrapper, depth: Int = 0) -> String {
    let elementType = node.family.elementType

    if elementType == "#text" {
        return node.text ?? ""
    }

    let indent = String(repeating: "  ", count: depth)

    // Build attributes string
    var attrParts: [String] = []
    for (key, value) in node.props.sorted(by: { $0.key < $1.key }) {
        if key == "style" {
            if let styleDict = value as? [String: Any] {
                let css = styleDictToCSS(styleDict)
                if !css.isEmpty {
                    attrParts.append("style=\"\(css)\"")
                }
            }
        } else if key == "children" || key == "instanceHandle" {
            continue
        } else if value is NSNull {
            continue
        } else {
            attrParts.append("\(key)=\"\(value)\"")
        }
    }

    let attrString = attrParts.isEmpty ? "" : " " + attrParts.joined(separator: " ")

    if node.children.isEmpty {
        return "\(indent)<\(elementType)\(attrString) />"
    }

    // Check if children are all text — render inline
    let allText = node.children.allSatisfy { $0.family.elementType == "#text" }
    if allText {
        let text = node.children.map { $0.text ?? "" }.joined()
        return "\(indent)<\(elementType)\(attrString)>\(text)</\(elementType)>"
    }

    var lines = ["\(indent)<\(elementType)\(attrString)>"]
    for child in node.children {
        lines.append(nodeToHTML(child, depth: depth + 1))
    }
    lines.append("\(indent)</\(elementType)>")
    return lines.joined(separator: "\n")
}
```

**Step 3: Build and verify**

Run: `npm run test:swift`
Expected: existing tests pass

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "feat(devtools): add $$getInlineStyle and $$getOuterHTML bridges"
```

---

### Task 4: DOMAgent.js — in-app CDP handler

Route DOM/CSS CDP requests to the `$$` bridge functions.

**Files:**
- Create: `packages/react-dom-native/src/devtools/DOMAgent.js`
- Modify: `packages/react-dom-native/src/devtools/RuntimeAgent.js` (add DOM/CSS domain routing to `$$handleCDPRequest`)
- Modify: `packages/react-dom-native/src/entry.js` (require DOMAgent)

**Step 1: Create `DOMAgent.js`**

```js
'use strict';

// ---------------------------------------------------------------------------
// DOM/CSS Agent (in-JSC)
//
// Handles CDP DOM and CSS domain requests forwarded from the inspector proxy.
// Calls $$ bridge functions that read the native shadow tree and Yoga layout.
//
// Incoming messages (via $$handleCDPRequest):
//   {requestId, domain: 'DOM'|'CSS', method, params}
//
// Outgoing messages (via $$sendInspectorMessage):
//   {type: 'cdp-response', requestId, result}
// ---------------------------------------------------------------------------

function handleDOMRequest(requestId, method, params) {
  var result;

  switch (method) {
    case 'enable':
    case 'disable':
      result = {};
      break;

    case 'getDocument': {
      if (typeof $$getDocumentTree === 'function') {
        var surfaceId = 1; // Default surface
        result = $$getDocumentTree(surfaceId);
      } else {
        result = {
          root: {
            nodeId: 1,
            backendNodeId: 1,
            nodeType: 9,
            nodeName: '#document',
            localName: '',
            nodeValue: '',
            childNodeCount: 0,
            children: [],
            documentURL: 'falcon://app',
            baseURL: 'falcon://app',
            xmlVersion: '',
          },
        };
      }
      break;
    }

    case 'requestChildNodes':
      // Full tree already returned in getDocument
      result = {};
      break;

    case 'getOuterHTML': {
      if (typeof $$getOuterHTML === 'function' && params.nodeId) {
        result = $$getOuterHTML(params.nodeId);
      } else {
        result = {outerHTML: ''};
      }
      break;
    }

    case 'highlightNode': {
      var nodeId = params.nodeId || (params.highlightConfig && params.highlightConfig.nodeId);
      if (typeof $$highlightNode === 'function' && nodeId) {
        $$highlightNode(nodeId);
      }
      result = {};
      break;
    }

    case 'highlightRect':
      result = {};
      break;

    case 'hideHighlight': {
      if (typeof $$hideHighlight === 'function') {
        $$hideHighlight();
      }
      result = {};
      break;
    }

    case 'querySelector':
    case 'querySelectorAll':
      result = method === 'querySelector' ? {nodeId: 0} : {nodeIds: []};
      break;

    case 'resolveNode': {
      result = {object: {type: 'object', objectId: String(params.nodeId || 0)}};
      break;
    }

    case 'setInspectedNode':
    case 'pushNodesByBackendIdsToFrontend':
    case 'markUndoableState':
      result = {};
      break;

    default:
      result = {};
      break;
  }

  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-response',
      requestId: requestId,
      result: result,
    }));
  }
}

function handleCSSRequest(requestId, method, params) {
  var result;

  switch (method) {
    case 'enable':
    case 'disable':
      result = {};
      break;

    case 'getComputedStyleForNode': {
      if (typeof $$getComputedStyle === 'function' && params.nodeId) {
        result = $$getComputedStyle(params.nodeId);
      } else {
        result = {computedStyle: []};
      }
      break;
    }

    case 'getInlineStylesForNode': {
      if (typeof $$getInlineStyle === 'function' && params.nodeId) {
        var inlineStyle = $$getInlineStyle(params.nodeId);
        result = {inlineStyle: inlineStyle};
      } else {
        result = {inlineStyle: {cssProperties: [], shorthandEntries: []}};
      }
      break;
    }

    case 'getMatchedStylesForNode': {
      // Return inline style as the only "matched rule"
      var style = {cssProperties: [], shorthandEntries: []};
      if (typeof $$getInlineStyle === 'function' && params.nodeId) {
        style = $$getInlineStyle(params.nodeId);
      }
      result = {
        inlineStyle: style,
        matchedCSSRules: [],
        pseudoElements: [],
        inherited: [],
        cssKeyframesRules: [],
      };
      break;
    }

    case 'getMediaQueries':
      result = {medias: []};
      break;

    case 'getStyleSheetText':
      result = {text: ''};
      break;

    case 'getPlatformFontsForNode':
      result = {fonts: []};
      break;

    default:
      result = {};
      break;
  }

  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-response',
      requestId: requestId,
      result: result,
    }));
  }
}

// Export for use by $$handleCDPRequest
globalThis.$$handleDOMRequest = handleDOMRequest;
globalThis.$$handleCSSRequest = handleCSSRequest;
```

**Step 2: Add DOM/CSS routing to `$$handleCDPRequest` in `RuntimeAgent.js`**

In `RuntimeAgent.js`, modify the `$$handleCDPRequest` function (line 277) to add DOM and CSS routing:

```js
// At the end of $$handleCDPRequest (line 277-290), add:
globalThis.$$handleCDPRequest = function (jsonString) {
  var request;
  try {
    request = JSON.parse(jsonString);
  } catch (e) {
    return;
  }

  if (request.domain === 'Runtime') {
    handleRuntimeRequest(request.requestId, request.method, request.params || {});
  } else if (request.domain === 'Profiler') {
    handleProfilerRequest(request.requestId, request.method, request.params || {});
  } else if (request.domain === 'DOM') {
    if (typeof $$handleDOMRequest === 'function') {
      $$handleDOMRequest(request.requestId, request.method, request.params || {});
    }
  } else if (request.domain === 'CSS') {
    if (typeof $$handleCSSRequest === 'function') {
      $$handleCSSRequest(request.requestId, request.method, request.params || {});
    }
  }
};
```

**Step 3: Add `require('./devtools/DOMAgent')` to `entry.js`**

In `packages/react-dom-native/src/entry.js`, add before `InspectorMessageHandler` (which must be last):

```js
  require('./devtools/DOMAgent');               // CDP DOM/CSS domain handlers
  require('./devtools/InspectorMessageHandler'); // Must be last — dispatches to all above
```

**Step 4: Build and verify**

Run: `npm test`
Expected: JS unit tests pass

**Step 5: Commit**

```bash
git add packages/react-dom-native/src/devtools/DOMAgent.js \
       packages/react-dom-native/src/devtools/RuntimeAgent.js \
       packages/react-dom-native/src/entry.js
git commit -m "feat(devtools): add DOMAgent for CDP DOM/CSS domain handling"
```

---

### Task 5: Inspector proxy — DOM and CSS domain forwarding

Replace the empty DOM stub and CSS stub with forwarding handlers.

**Files:**
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Replace `createDOMDomain()` (line 859-889)**

Replace the entire function with a forwarding version. The key pattern: methods that need data from the app use `pendingCDPRequests` to store the WebSocket+ID, send a `cdp-request` to the app, and return `null` (deferred response). Methods that can be answered locally return a result immediately.

```js
function createDOMDomain() {
  var pendingRequests = new Map();
  var nextReqId = 0;
  var enabled = false;

  function forward(method, params, ctx) {
    var reqId = 'dom-' + (nextReqId++);
    log('DOM', 'Forwarding ' + method + ' to app (reqId=' + reqId + ')');
    pendingRequests.set(reqId, {ws: ctx.ws, id: ctx._currentId});
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'DOM',
        method: method,
        params: params,
      }));
    }
    return null; // deferred — response comes via handleAppMessage
  }

  function handle(method, params, ctx) {
    log('DOM', method);
    switch (method) {
      case 'enable':
        enabled = true;
        return {};
      case 'disable':
        enabled = false;
        return {};

      // Forward to app — need shadow tree data
      case 'getDocument':
      case 'getOuterHTML':
      case 'highlightNode':
      case 'hideHighlight':
      case 'resolveNode':
        return forward(method, params, ctx);

      // Local stubs
      case 'requestChildNodes':
      case 'markUndoableState':
      case 'setInspectedNode':
      case 'pushNodesByBackendIdsToFrontend':
        return {};
      case 'highlightRect':
        return forward('highlightNode', params, ctx);
      case 'querySelector':
        return {nodeId: 0};
      case 'querySelectorAll':
        return {nodeIds: []};

      default:
        return {};
    }
  }

  return {
    name: 'DOM',
    handle: handle,
    handleAppMessage: function (message) {
      // Handle cdp-response for forwarded requests
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('DOM', 'Got cdp-response for ' + message.requestId);
          pendingRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
      // Handle live tree updates
      if (message.type === 'dom-updated') {
        log('DOM', 'Tree updated — broadcasting DOM.documentUpdated');
        if (ctx && ctx.broadcastCDP) {
          ctx.broadcastCDP({method: 'DOM.documentUpdated', params: {}});
        }
      }
    },
  };
}
```

**Step 2: Replace `createCSSDomain()` (line 986-998)**

Replace with forwarding version:

```js
function createCSSDomain() {
  var pendingRequests = new Map();
  var nextReqId = 0;

  function forward(method, params, ctx) {
    var reqId = 'css-' + (nextReqId++);
    log('CSS', 'Forwarding ' + method + ' to app (reqId=' + reqId + ')');
    pendingRequests.set(reqId, {ws: ctx.ws, id: ctx._currentId});
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({
        type: 'cdp-request',
        requestId: reqId,
        domain: 'CSS',
        method: method,
        params: params,
      }));
    }
    return null;
  }

  function handle(method, params, ctx) {
    log('CSS', method);
    switch (method) {
      case 'enable':
      case 'disable':
        return {};

      // Forward to app — need style data
      case 'getComputedStyleForNode':
      case 'getInlineStylesForNode':
      case 'getMatchedStylesForNode':
        return forward(method, params, ctx);

      // Local stubs
      case 'getMediaQueries':
        return {medias: []};
      case 'getStyleSheetText':
        return {text: ''};
      case 'getPlatformFontsForNode':
        return {fonts: []};
      default:
        return {};
    }
  }

  return {
    name: 'CSS',
    handle: handle,
    handleAppMessage: function (message) {
      if (message.type === 'cdp-response') {
        var pending = pendingRequests.get(message.requestId);
        if (pending) {
          log('CSS', 'Got cdp-response for ' + message.requestId);
          pendingRequests.delete(message.requestId);
          pending.ws.readyState === 1 &&
            pending.ws.send(JSON.stringify({id: pending.id, result: message.result}));
        }
      }
    },
  };
}
```

**Step 3: Wire `handleAppMessage` for DOM and CSS domains**

In `createInspectorProxy()`, the DOM and CSS domains are currently created with `createDOMDomain()` and `createCSSDomain()` and added to the router. The router already handles `handleAppMessage` for domains that have it — check how runtimeDomain.handleAppMessage is called.

Find where app messages are dispatched (search for `handleAppMessage` in the proxy) and add calls for `domDomain.handleAppMessage` and `cssDomain.handleAppMessage`:

The existing code around line 1175-1195 creates domain objects and passes them to `createDomainRouter`. The app message handling section (search for `runtimeDomain.handleAppMessage`) is where we need to add our domains.

```js
// Where runtimeDomain.handleAppMessage is called, add:
if (domDomain.handleAppMessage) domDomain.handleAppMessage(message);
if (cssDomain.handleAppMessage) cssDomain.handleAppMessage(message);
```

Also need to store the domDomain and cssDomain as named variables (they currently use inline `createCSSDomain()` — change to named variables like `domDomain`):

The DOM domain is already assigned to `var domDomain = createDOMDomain()` at line 1180. The CSS domain is inline at line 1158 — extract it to `var cssDomain = createCSSDomain()` and use `cssDomain` in the router array.

**Step 4: Fix the `dom-updated` broadcast**

The `handleAppMessage` in the DOM domain needs access to `ctx.broadcastCDP`. The `ctx` variable isn't available in `handleAppMessage` because it's per-request. Instead, capture `broadcastCDP` from the proxy's scope. Look at how the existing code handles broadcasts (search for `broadcastCDP` in the proxy).

The domain needs a reference to the broadcast function. The simplest approach: the DOM domain's `handleAppMessage` emits a `dom-updated` event, and the proxy's message dispatch loop handles broadcasting. Alternatively, pass `broadcastCDP` as a parameter to the domain factory.

Update `createDOMDomain` to accept a `broadcastCDP` parameter:

```js
function createDOMDomain(broadcastCDP) {
  // ... same as above, but in handleAppMessage:
  if (message.type === 'dom-updated' && broadcastCDP) {
    log('DOM', 'Tree updated — broadcasting DOM.documentUpdated');
    broadcastCDP({method: 'DOM.documentUpdated', params: {}});
  }
}
```

And in `createInspectorProxy`, pass the broadcast function:

```js
var domDomain = createDOMDomain(function(msg) { broadcastCDP(msg); });
```

Look at how `broadcastCDP` is defined in the proxy (search for it) to get the exact reference.

**Step 5: Build and verify**

Run: `cd example && npm run dev` — start the dev server.
Run: `/build-demo` — build the app.
Open `chrome://inspect` → connect to the target.
Expected: Elements tab shows the shadow tree.

**Step 6: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "feat(devtools): wire DOM/CSS domain forwarding in inspector proxy"
```

---

### Task 6: Live updates — `dom-updated` notification from `$$completeRoot`

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add dom-updated notification at the end of `$$completeRoot`**

In Bindings.swift, inside the `$$completeRoot` handler, after step 6 (promote new tree, line 810: `self.currentTrees[surfaceId] = newChildren`), add the notification. Place it after the stale node cleanup (step 7, ~line 846) so the registry is clean when DevTools re-fetches:

```swift
            // 8. Notify DevTools that the DOM tree changed
            if let sendMsg = engine.getGlobalProperty("$$sendInspectorMessage") {
                let notification = engine.makeObject()
                engine.setProperty(notification, "type", engine.makeString("dom-updated"))
                engine.setProperty(notification, "surfaceId", engine.makeNumber(Double(surfaceId)))
                let json = engine.callFunction(
                    engine.getGlobalProperty("JSON")!.let { jsonObj in
                        engine.getProperty(jsonObj, "stringify")!
                    },
                    args: [notification]
                )
                // Simpler: just build the JSON string directly
            }
```

Actually, the simpler approach — `$$sendInspectorMessage` takes a JSON string, so construct it directly:

```swift
            // 8. Notify DevTools that the DOM tree changed
            if self.sendInspectorMessage != nil {
                self.sendInspectorMessage?("{\"type\":\"dom-updated\",\"surfaceId\":\(surfaceId)}")
            }
```

This uses the existing `sendInspectorMessage` callback (which is already wired to the HotReloadClient WebSocket) without needing to go through JSC at all.

**Step 2: Build and verify**

Run: `npm run test:swift`
Expected: existing tests pass

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "feat(devtools): emit dom-updated after React commits"
```

---

### Task 7: Element highlight overlay

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/ElementHighlightOverlay.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Create `ElementHighlightOverlay.swift`**

```swift
import UIKit
import Yoga
import ShadowTree

// ---------------------------------------------------------------------------
// ElementHighlightOverlay
//
// Draws a Chrome DevTools-style box model overlay on top of a UIView.
// Shows content (blue), padding (green), border (yellow), and margin (orange)
// regions with translucent fills. Only one highlight is active at a time.
// ---------------------------------------------------------------------------

class ElementHighlightOverlay {

    private weak var rootView: UIView?
    private var overlayView: UIView?

    init(rootView: UIView?) {
        self.rootView = rootView
    }

    func highlight(node: ShadowNodeWrapper, view: UIView) {
        hide()

        guard let rootView = rootView else { return }

        let yoga = node.yogaNode

        // Read box model values from Yoga layout
        let marginTop = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .top)))
        let marginRight = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .right)))
        let marginBottom = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .bottom)))
        let marginLeft = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .left)))

        let borderTop = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .top)))
        let borderRight = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .right)))
        let borderBottom = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .bottom)))
        let borderLeft = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .left)))

        let paddingTop = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .top)))
        let paddingRight = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .right)))
        let paddingBottom = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .bottom)))
        let paddingLeft = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .left)))

        // Convert view frame to root view coordinates
        let viewFrame = view.convert(view.bounds, to: rootView)

        // Calculate regions (margin is outside the view frame)
        let marginRect = CGRect(
            x: viewFrame.origin.x - marginLeft,
            y: viewFrame.origin.y - marginTop,
            width: viewFrame.width + marginLeft + marginRight,
            height: viewFrame.height + marginTop + marginBottom
        )

        let borderRect = viewFrame

        let paddingRect = CGRect(
            x: viewFrame.origin.x + borderLeft,
            y: viewFrame.origin.y + borderTop,
            width: viewFrame.width - borderLeft - borderRight,
            height: viewFrame.height - borderTop - borderBottom
        )

        let contentRect = CGRect(
            x: paddingRect.origin.x + paddingLeft,
            y: paddingRect.origin.y + paddingTop,
            width: paddingRect.width - paddingLeft - paddingRight,
            height: paddingRect.height - paddingTop - paddingBottom
        )

        // Create overlay
        let overlay = HighlightView(frame: marginRect)
        overlay.marginRect = CGRect(origin: .zero, size: marginRect.size)
        overlay.borderRect = borderRect.offsetBy(dx: -marginRect.origin.x, dy: -marginRect.origin.y)
        overlay.paddingRect = paddingRect.offsetBy(dx: -marginRect.origin.x, dy: -marginRect.origin.y)
        overlay.contentRect = contentRect.offsetBy(dx: -marginRect.origin.x, dy: -marginRect.origin.y)
        overlay.isUserInteractionEnabled = false
        overlay.backgroundColor = .clear

        rootView.addSubview(overlay)
        self.overlayView = overlay
    }

    func hide() {
        overlayView?.removeFromSuperview()
        overlayView = nil
    }

    private func nanToZero(_ value: Float) -> Float {
        return value.isNaN ? 0 : value
    }
}

// MARK: - HighlightView

private class HighlightView: UIView {
    var marginRect: CGRect = .zero
    var borderRect: CGRect = .zero
    var paddingRect: CGRect = .zero
    var contentRect: CGRect = .zero

    // Chrome DevTools highlight colors
    private let marginColor = UIColor(red: 246/255, green: 178/255, blue: 107/255, alpha: 0.66)
    private let borderColor = UIColor(red: 255/255, green: 229/255, blue: 153/255, alpha: 0.66)
    private let paddingColor = UIColor(red: 147/255, green: 196/255, blue: 125/255, alpha: 0.55)
    private let contentColor = UIColor(red: 111/255, green: 168/255, blue: 220/255, alpha: 0.66)

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Margin (outermost) — fill the whole rect, then paint over with inner regions
        ctx.setFillColor(marginColor.cgColor)
        ctx.fill(marginRect)

        // Border
        ctx.setFillColor(borderColor.cgColor)
        ctx.fill(borderRect)

        // Padding
        ctx.setFillColor(paddingColor.cgColor)
        ctx.fill(paddingRect)

        // Content (innermost)
        ctx.setFillColor(contentColor.cgColor)
        ctx.fill(contentRect)
    }
}
```

**Step 2: Add `$$highlightNode` and `$$hideHighlight` to Bindings.swift**

Add to `registerElementsInspector()`:

```swift
    // $$highlightNode(nodeId) -> void
    // Draws a box model overlay on the UIView for the given node.
    engine.setGlobalFunction("$$highlightNode") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        guard let nodeId = engine.toInt(args[0]),
              let node = self.nodeRegistry[nodeId] else { return nil }

        let view = self.viewRegistry.view(for: node.family)
        guard let targetView = view else { return nil }

        // Find the root view for this node's surface
        let surfaceId = node.family.surfaceId
        guard let rootView = self.rootViews[surfaceId] else { return nil }

        if self.highlightOverlay == nil {
            self.highlightOverlay = ElementHighlightOverlay(rootView: rootView)
        }
        self.highlightOverlay?.highlight(node: node, view: targetView)

        return nil
    }

    // $$hideHighlight() -> void
    engine.setGlobalFunction("$$hideHighlight") { [weak self] _ in
        self?.highlightOverlay?.hide()
        return nil
    }
```

Add the property to the Bindings class (alongside other properties near line 75):

```swift
    /// Highlight overlay for DevTools element inspection.
    private var highlightOverlay: ElementHighlightOverlay?
```

**Step 3: Build and verify**

Run: `npm run test:swift`
Expected: existing tests pass

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/ElementHighlightOverlay.swift \
       packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "feat(devtools): add element highlight overlay for box model visualization"
```

---

### Task 8: End-to-end verification

**Files:** None (testing only)

**Step 1: Start the dev server**

Run: `cd example && npm run dev`

**Step 2: Build and run the app**

Use `/build-demo` skill to build and launch the app on the simulator.

**Step 3: Connect Chrome DevTools**

Open Chrome and navigate to `chrome://inspect`. The Falcon app should appear as a target. Click "inspect" to open DevTools.

**Step 4: Verify Elements tab**

1. Click the "Elements" tab in DevTools
2. Expected: A DOM tree showing `#document > body > div > ...` with the shadow tree structure
3. Click on a `<div>` node
4. Expected: Styles panel shows inline styles from the `style` prop
5. Click "Computed" tab
6. Expected: Computed style values showing Yoga layout (width, height, margins, padding, flex properties)
7. Expected: Box model diagram showing correct dimensions

**Step 5: Verify live updates**

1. Modify a server component file (e.g., add a new `<p>` tag)
2. Wait for hot reload
3. Expected: Elements tree refreshes automatically to show the new element

**Step 6: Verify highlighting**

1. Hover over nodes in the Elements tab
2. Expected: Colored overlay appears on the corresponding view in the simulator
3. Move away from the node
4. Expected: Overlay disappears

**Step 7: Commit any fixes**

If any issues are found during testing, fix and commit with descriptive messages.
