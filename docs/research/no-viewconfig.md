# Research: Eliminating ViewConfig

## Overview

This document analyzes React Native's ViewConfig system and designs its elimination for react-dom-native. Since we have a fixed set of known HTML elements (`<div>`, `<span>`, `<p>`, etc.) rather than a dynamic component registry, we can remove the ViewConfig validation layer entirely, simplifying both JavaScript and C++ sides significantly.

---

## Part 1: What ViewConfig Does in React Native

### 1.1 ViewConfig Structure

In React Native, every native component has a **ViewConfig** object that contains:

```javascript
{
  uiViewClassName: 'RCTView',           // Native class name
  bubblingEventTypes: {                  // Events that bubble up
    topChange: {
      phasedRegistrationNames: {
        bubbled: 'onChange',
        captured: 'onChangeCapture'
      }
    }
  },
  directEventTypes: {                    // Events dispatched directly
    topLoadingStart: {
      registrationName: 'onLoadStart'
    }
  },
  validAttributes: {                     // Allowed props with transform info
    style: ReactNativeStyleAttributes,
    opacity: true,
    onLayout: true,
    pointerEvents: true,
    hitSlop: { diff: insetsDiffer },
    transform: { diff: matricesDiffer },
    // ... many more
  }
}
```

### 1.2 ViewConfig Consumption Points

ViewConfig is consumed in several places:

| Location | Usage | Purpose |
|----------|-------|---------|
| `NativeComponentRegistry.get()` | Registration entry point | Lazily creates/caches ViewConfig |
| `getViewConfigForType()` | Renderer lookup | Returns ViewConfig for a component type |
| `createAttributePayload()` | Initial props | Filters props through `validAttributes` |
| `diffAttributePayloads()` | Update diffing | Diffs old vs new props using `validAttributes` |
| Event registration | Event setup | Maps JS event names to native event types |
| Dev validation | `__DEV__` checks | Validates props against `validAttributes` |

### 1.3 What `validAttributes` Filters

The `validAttributes` object serves multiple purposes:

1. **Prop whitelisting**: Only props in `validAttributes` are sent to native
2. **Type transformation**: Specifies `process` functions to transform values
3. **Diff optimization**: Specifies custom `diff` functions for complex types
4. **Event handler detection**: Function props are converted to `true` (registration flag)

Example transformations:
```javascript
validAttributes: {
  // Simple boolean - prop is valid, no transform
  opacity: true,

  // With process function - transforms value before sending
  transform: { process: processTransform },

  // With diff function - custom comparison for updates
  hitSlop: { diff: insetsDiffer },

  // Nested for style object
  style: {
    backgroundColor: { process: processColor },
    transform: { process: processTransform },
    // ...
  }
}
```

### 1.4 Event Type Registration

`bubblingEventTypes` and `directEventTypes` define event handling:

- **Bubbling events**: Propagate up the component tree (touch, change)
- **Direct events**: Dispatched only to the target component (load, error)

Validation ensures an event cannot be both direct and bubbling.

---

## Part 2: How Fabric Handles Props in C++

### 2.1 Fabric's createNode Flow

In Fabric's new architecture, props flow differently:

```cpp
// UIManagerBinding.cpp - called from JS
ShadowNode::Shared UIManager::createNode(
    Tag tag,
    std::string const &name,           // "RCTView", "RCTText", etc.
    SurfaceId surfaceId,
    RawProps rawProps,                  // All props from JS, unfiltered
    InstanceHandle::Shared instanceHandle) {

  // 1. Look up ComponentDescriptor by string name
  auto &componentDescriptor = componentDescriptorRegistry_->at(name);

  // 2. Create props parser context
  auto propsParserContext = PropsParserContext{surfaceId, *contextContainer_};

  // 3. ComponentDescriptor parses raw props into typed Props struct
  auto props = componentDescriptor.cloneProps(
      propsParserContext,
      nullptr,           // no base props
      std::move(rawProps)
  );

  // 4. Create shadow node with typed props
  auto shadowNode = componentDescriptor.createShadowNode(
      ShadowNodeFragment{
          .props = props,
          .children = ShadowNodeFragment::childrenPlaceholder(),
          .state = state,
      },
      family);

  return shadowNode;
}
```

### 2.2 ComponentDescriptor Role

Each native component type has a **ComponentDescriptor** that:

1. **Creates Props structs**: Parses `RawProps` into C++ `Props` objects
2. **Creates ShadowNodes**: Factory for shadow node instances
3. **Handles cloning**: Clones nodes with updated props
4. **Provides type info**: Returns component name, handle, traits

```cpp
class ViewComponentDescriptor : public ConcreteComponentDescriptor<ViewShadowNode> {
  // Inherits from template that provides:
  // - cloneProps() - parses RawProps into ViewProps
  // - createShadowNode() - creates ViewShadowNode
  // - createFamily() - creates ShadowNodeFamily
};
```

### 2.3 Codegen and Props Structs

Fabric uses **Codegen** to generate C++ Props structs from JS specs:

```typescript
// JavaScript spec
export interface ModuleProps extends ViewProps {
  text?: string;
  color?: ColorValue;
}
```

Generates:

```cpp
// C++ Props struct
struct MyComponentProps : public ViewProps {
  std::string text{""};
  SharedColor color{};
};
```

**Key insight**: In Fabric, prop validation happens at **build time** via Codegen, not at runtime via ViewConfig. A mismatch triggers a build error.

---

## Part 3: Our Simplified Design

### 3.1 Why ViewConfig Is Unnecessary for Us

| ViewConfig Feature | Our Situation | Replacement |
|-------------------|---------------|-------------|
| Component registration | Fixed set of HTML elements | Static lookup table |
| Prop whitelisting | All HTML props are known | Pass all props, C++ handles |
| Prop transformation | Known transforms per element | Hardcoded in JS or C++ |
| Dev validation | Known props per element | Build-time or simple runtime check |
| Event type registration | Fixed event set | Static event table |

Since we only support `<div>`, `<span>`, `<p>`, `<img>`, `<button>`, `<input>`, etc., the entire ViewConfig indirection layer adds complexity without benefit.

### 3.2 How `createInstance("div", props)` Works Without ViewConfig

```javascript
// packages/renderer/src/ReactDOMNativeHostConfig.js

import { bridge } from '@react-dom-native/bridge';

export function createInstance(type, props, rootContainer, hostContext, internalHandle) {
  // No ViewConfig lookup - just pass the element type string directly
  const nativeHandle = bridge.createNode(
    type,                    // "div", "span", "p", etc.
    props,                   // Raw props object, unfiltered
    internalHandle           // For node identity
  );

  return {
    type,
    props,
    nativeHandle,
    children: [],
  };
}
```

On the C++ side:

```cpp
// ios/Native/ShadowTree/HTMLElementDescriptor.cpp

ShadowNode::Shared createNode(
    const std::string& type,   // "div", "span", "p"
    const folly::dynamic& props,
    InstanceHandle handle) {

  // Static dispatch based on element type string
  if (type == "div") {
    return createDivNode(props, handle);
  } else if (type == "span") {
    return createSpanNode(props, handle);
  } else if (type == "p") {
    return createParagraphNode(props, handle);
  } else if (type == "img") {
    return createImageNode(props, handle);
  }
  // ... etc

  throw std::invalid_argument("Unknown element type: " + type);
}
```

### 3.3 ComponentDescriptor Design: Universal vs Per-Element

**Option A: Single Universal HTMLElementDescriptor**

```cpp
class HTMLElementDescriptor {
public:
  ShadowNode::Shared createShadowNode(
      const std::string& elementType,
      const RawProps& rawProps,
      InstanceHandle handle) {

    // All HTML elements share this descriptor
    // Element-specific behavior based on type string
    auto yogaConfig = getYogaDefaults(elementType);
    auto props = parseProps(elementType, rawProps);

    return std::make_shared<HTMLShadowNode>(
        elementType, props, yogaConfig, handle);
  }

private:
  YogaConfig getYogaDefaults(const std::string& type) {
    static const std::unordered_map<std::string, YogaConfig> defaults = {
      {"div", {.flexDirection = YGFlexDirectionColumn, .flexShrink = 0}},
      {"span", {.flexDirection = YGFlexDirectionRow, .flexShrink = 1}},
      {"p", {.flexDirection = YGFlexDirectionColumn, .marginTop = 16, .marginBottom = 16}},
      // ...
    };
    return defaults.at(type);
  }
};
```

**Option B: Per-Element Descriptors (like Fabric)**

```cpp
class DivDescriptor : public HTMLElementDescriptor<DivShadowNode, DivProps> {};
class SpanDescriptor : public HTMLElementDescriptor<SpanShadowNode, SpanProps> {};
class ParagraphDescriptor : public HTMLElementDescriptor<ParagraphShadowNode, ParagraphProps> {};
```

**Recommendation: Hybrid Approach**

Use a single `HTMLShadowNode` class with element-type parameterization, but provide type-specific Props parsing:

```cpp
// One ShadowNode class for all HTML elements
class HTMLShadowNode : public ShadowNode {
  std::string elementType_;    // "div", "span", etc.
  HTMLProps props_;            // Union/variant of all HTML props
  YGNodeRef yogaNode_;
};

// Element registry for static lookup
class HTMLElementRegistry {
public:
  static const ElementConfig& get(const std::string& type) {
    static const std::unordered_map<std::string, ElementConfig> registry = {
      {"div", ElementConfig{
        .yogaDefaults = {...},
        .isTextContainer = false,
        .isVirtual = false,
      }},
      {"span", ElementConfig{
        .yogaDefaults = {...},
        .isTextContainer = false,
        .isVirtual = true,  // Virtual inside text context
        .fallbackConfig = {...},
      }},
      {"p", ElementConfig{
        .yogaDefaults = {...},
        .isTextContainer = true,
        .isVirtual = false,
      }},
      // ... all HTML elements
    };

    auto it = registry.find(type);
    if (it == registry.end()) {
      throw std::invalid_argument("Unknown HTML element: " + type);
    }
    return it->second;
  }
};
```

### 3.4 Prop Diffing Without `validAttributes`

React Native's `diffAttributePayloads` uses `validAttributes` to:
1. Skip props not in the whitelist
2. Use custom `diff` functions for complex types
3. Detect changed event handlers

Our replacement:

```javascript
// packages/renderer/src/propDiff.js

const STYLE_PROPS = new Set([
  'backgroundColor', 'color', 'opacity', 'transform',
  'width', 'height', 'margin', 'padding', 'flex',
  // ... all style props
]);

const LAYOUT_PROPS = new Set([
  'display', 'flexDirection', 'justifyContent', 'alignItems',
  'flexGrow', 'flexShrink', 'flexBasis', 'position',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'top', 'right', 'bottom', 'left', 'gap', 'rowGap', 'columnGap',
  'aspectRatio', 'overflow',
]);

const EVENT_PROPS = new Set([
  'onClick', 'onPress', 'onChange', 'onFocus', 'onBlur',
  'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onLayout',
  'onScroll', 'onLoad', 'onError',
]);

export function diffProps(elementType, oldProps, newProps) {
  const updates = {};
  const layoutUpdates = {};
  let hasLayoutChanges = false;
  let hasStyleChanges = false;

  // Check all props from both old and new
  const allKeys = new Set([
    ...Object.keys(oldProps || {}),
    ...Object.keys(newProps || {})
  ]);

  for (const key of allKeys) {
    const oldValue = oldProps?.[key];
    const newValue = newProps?.[key];

    // Skip children - handled separately by reconciler
    if (key === 'children') continue;

    // Skip unchanged values
    if (shallowEqual(oldValue, newValue)) continue;

    // Handle style object specially
    if (key === 'style') {
      const styleDiff = diffStyle(oldValue, newValue);
      if (styleDiff) {
        Object.assign(updates, styleDiff.visual);
        Object.assign(layoutUpdates, styleDiff.layout);
        hasLayoutChanges = hasLayoutChanges || styleDiff.hasLayoutChanges;
        hasStyleChanges = true;
      }
      continue;
    }

    // Handle event handlers - just track registration
    if (EVENT_PROPS.has(key)) {
      updates[key] = newValue != null;
      continue;
    }

    // All other props pass through
    updates[key] = newValue;

    if (LAYOUT_PROPS.has(key)) {
      layoutUpdates[key] = newValue;
      hasLayoutChanges = true;
    }
  }

  return {
    updates,
    layoutUpdates,
    hasLayoutChanges,
    hasStyleChanges,
  };
}

function diffStyle(oldStyle, newStyle) {
  if (!oldStyle && !newStyle) return null;

  const visual = {};
  const layout = {};
  let hasLayoutChanges = false;

  const allKeys = new Set([
    ...Object.keys(oldStyle || {}),
    ...Object.keys(newStyle || {})
  ]);

  for (const key of allKeys) {
    const oldValue = oldStyle?.[key];
    const newValue = newStyle?.[key];

    if (!shallowEqual(oldValue, newValue)) {
      if (LAYOUT_PROPS.has(key)) {
        layout[key] = newValue;
        hasLayoutChanges = true;
      } else {
        visual[key] = newValue;
      }
    }
  }

  return { visual, layout, hasLayoutChanges };
}
```

### 3.5 Event System Without ViewConfig

Instead of dynamic event type registration via `bubblingEventTypes`/`directEventTypes`, we use a static event table:

```cpp
// ios/Native/Events/HTMLEventRegistry.h

enum class EventDispatchMode {
  Bubbling,
  Direct
};

struct EventConfig {
  std::string nativeEventName;    // "topClick", "topChange"
  std::string jsEventName;        // "onClick", "onChange"
  EventDispatchMode mode;
};

class HTMLEventRegistry {
public:
  static const std::vector<EventConfig>& getAllEvents() {
    static const std::vector<EventConfig> events = {
      // Bubbling events
      {"topClick", "onClick", EventDispatchMode::Bubbling},
      {"topPress", "onPress", EventDispatchMode::Bubbling},
      {"topChange", "onChange", EventDispatchMode::Bubbling},
      {"topFocus", "onFocus", EventDispatchMode::Bubbling},
      {"topBlur", "onBlur", EventDispatchMode::Bubbling},
      {"topTouchStart", "onTouchStart", EventDispatchMode::Bubbling},
      {"topTouchMove", "onTouchMove", EventDispatchMode::Bubbling},
      {"topTouchEnd", "onTouchEnd", EventDispatchMode::Bubbling},
      {"topTouchCancel", "onTouchCancel", EventDispatchMode::Bubbling},
      {"topKeyDown", "onKeyDown", EventDispatchMode::Bubbling},
      {"topKeyUp", "onKeyUp", EventDispatchMode::Bubbling},
      {"topSubmit", "onSubmit", EventDispatchMode::Bubbling},

      // Direct events (don't bubble)
      {"topLoad", "onLoad", EventDispatchMode::Direct},
      {"topError", "onError", EventDispatchMode::Direct},
      {"topLayout", "onLayout", EventDispatchMode::Direct},
      {"topScroll", "onScroll", EventDispatchMode::Direct},
      {"topLoadStart", "onLoadStart", EventDispatchMode::Direct},
      {"topLoadEnd", "onLoadEnd", EventDispatchMode::Direct},
    };
    return events;
  }

  static EventDispatchMode getDispatchMode(const std::string& eventName) {
    static const std::unordered_map<std::string, EventDispatchMode> lookup = []() {
      std::unordered_map<std::string, EventDispatchMode> map;
      for (const auto& event : getAllEvents()) {
        map[event.nativeEventName] = event.mode;
        map[event.jsEventName] = event.mode;
      }
      return map;
    }();

    auto it = lookup.find(eventName);
    return it != lookup.end() ? it->second : EventDispatchMode::Direct;
  }
};
```

---

## Part 4: What Validation Is Lost and Whether It Matters

### 4.1 Lost Validation

| Validation | RN Behavior | Our Approach | Risk |
|------------|-------------|--------------|------|
| Unknown prop warning | Warns in DEV if prop not in `validAttributes` | No warning, prop passed to C++ | Low - C++ ignores unknown props |
| Prop type coercion | `process` functions transform values | Explicit transforms in prop handlers | Low - we control all transforms |
| Event type conflicts | Invariant if event is both bubbling and direct | Static table prevents conflicts | None - compile-time guarantee |
| Missing ViewConfig | Throws if component not registered | Throws if element type unknown | Same - just different location |

### 4.2 Dev-Time Validation Replacement

For development builds, we can add lightweight validation:

```javascript
// packages/renderer/src/devValidation.js

const VALID_ELEMENTS = new Set([
  'div', 'span', 'p', 'a', 'button', 'input', 'textarea', 'select',
  'img', 'video', 'audio', 'canvas', 'svg',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'form', 'label', 'fieldset', 'legend',
  'header', 'footer', 'main', 'nav', 'section', 'article', 'aside',
  'strong', 'em', 'code', 'pre', 'blockquote',
  'hr', 'br',
]);

const KNOWN_PROPS = {
  _common: ['id', 'className', 'style', 'children', 'key', 'ref',
            'onClick', 'onPress', 'onChange', 'onFocus', 'onBlur',
            'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onLayout',
            'aria-label', 'aria-hidden', 'aria-disabled', 'role', 'tabIndex'],
  img: ['src', 'alt', 'onLoad', 'onError', 'loading'],
  input: ['type', 'value', 'defaultValue', 'placeholder', 'onChange',
          'onFocus', 'onBlur', 'onSubmit', 'maxLength', 'disabled', 'readOnly',
          'autoCapitalize', 'autoCorrect', 'autoFocus'],
  textarea: ['value', 'defaultValue', 'placeholder', 'rows', 'disabled'],
  a: ['href', 'target'],
  button: ['disabled', 'type'],
  select: ['value', 'disabled'],
  video: ['src', 'poster', 'autoPlay', 'loop', 'muted', 'controls'],
  // ... etc
};

export function validateElement(type, props) {
  if (__DEV__) {
    if (!VALID_ELEMENTS.has(type)) {
      console.error(
        `Unknown element type: "${type}". ` +
        `react-dom-native only supports standard HTML elements.`
      );
    }

    const validProps = new Set([
      ...KNOWN_PROPS._common,
      ...(KNOWN_PROPS[type] || [])
    ]);

    for (const prop of Object.keys(props)) {
      if (prop.startsWith('data-') || prop.startsWith('aria-')) continue;
      if (!validProps.has(prop) && !prop.startsWith('on')) {
        console.warn(
          `Unknown prop "${prop}" on <${type}>. ` +
          `This prop will be ignored.`
        );
      }
    }
  }
}
```

### 4.3 Trade-offs

**Benefits of eliminating ViewConfig:**

1. **Simpler architecture**: No runtime config negotiation or lazy registration
2. **Faster startup**: No ViewConfig computation or caching
3. **Smaller bundle**: No ViewConfig generation or registry code
4. **Type safety**: Build-time errors for prop mismatches (via TypeScript/Flow)
5. **Easier debugging**: Direct string -> native mapping, no indirection

**Potential downsides:**

1. **No extensibility**: Can't add new element types at runtime (but we don't need this)
2. **Manual sync**: Element configs in JS and C++ must stay in sync (mitigated by codegen)
3. **Less granular warnings**: Generic "unknown prop" vs specific validation

---

## Part 5: Implementation Summary

### 5.1 Inventory of ViewConfig Replacements

| ViewConfig Component | Replacement |
|---------------------|-------------|
| `NativeComponentRegistry.get()` | Static `HTMLElementRegistry.get(type)` in C++ |
| `getViewConfigForType()` | Not needed - element type string passed directly |
| `validAttributes` whitelist | Pass all props; C++ ignores unknown |
| `validAttributes.process` | Explicit transforms in `parseProps()` |
| `validAttributes.diff` | `diffProps()` with hardcoded style/layout prop sets |
| `bubblingEventTypes` | Static `HTMLEventRegistry` in C++ |
| `directEventTypes` | Static `HTMLEventRegistry` in C++ |
| DEV prop validation | Optional `validateElement()` in renderer |

### 5.2 Files to Create/Modify

**JavaScript:**
- `packages/renderer/src/ReactDOMNativeHostConfig.js` - Host config without ViewConfig
- `packages/renderer/src/propDiff.js` - Prop diffing without validAttributes
- `packages/renderer/src/devValidation.js` - Optional DEV-only validation

**C++:**
- `ios/Native/Registry/HTMLElementRegistry.cpp` - Element type -> config lookup
- `ios/Native/Events/HTMLEventRegistry.cpp` - Event name -> dispatch mode lookup
- `ios/Native/ShadowTree/HTMLShadowNode.cpp` - Universal shadow node for HTML elements

### 5.3 Data Flow Summary

```
React element tree (JSX)
    ↓
createInstance("div", {style: {...}, onClick: fn})
    ↓
bridge.createNode("div", props, handle)  // Raw string + props
    ↓
C++ HTMLElementRegistry.get("div")       // Static lookup
    ↓
HTMLShadowNode with Yoga defaults for "div"
    ↓
UIKit view creation
```

No ViewConfig involved at any step.

---

## References

- [React Native ViewConfig Registry](https://github.com/facebook/react-native/blob/v0.64.1/Libraries/Renderer/shims/ReactNativeViewConfigRegistry.js)
- [React Native UIManager.cpp](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/uimanager/UIManager.cpp)
- [Fabric Native Components Guide](https://github.com/reactwg/react-native-new-architecture/blob/main/docs/fabric-native-components.md)
- [React Native Fabric Architecture](https://reactnative.dev/architecture/fabric-renderer)
- [View Config Getter Improvements](https://github.com/facebook/react/commit/32e5c97d11e390e6a3d3ce6a2ab7443daed09747)
