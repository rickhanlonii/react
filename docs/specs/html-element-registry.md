# Spec: HTML Element Registry

## Overview

The HTML Element Registry is a static, compile-time lookup table mapping HTML element type strings to their native behavior: UIKit view class, Yoga layout defaults, text rendering mode, accessibility traits, and supported events.

## Module

- C++: `ios/Native/Registry/HTMLElementRegistry.h/.cpp`
- JS: `packages/components/src/registry.js` (mirror for DEV validation)

## Core Data Structures

### ElementDescriptor

```cpp
struct ElementDescriptor {
  std::string elementType;         // "div", "span", "p", etc.
  ElementCategory category;        // Container, TextContainer, VirtualText, etc.
  ViewType defaultViewType;        // UIView, UIScrollView, UIImageView, etc.
  YogaDefaults yogaDefaults;       // Per-element Yoga style defaults
  TextDefaults textDefaults;       // Font size, weight, style (for text elements)
  AccessibilityInfo accessibility; // ARIA role, traits, isAccessibilityElement

  // Event support
  bool supportsClick;
  bool supportsTouch;
  bool supportsScroll;
  bool supportsChange;
  bool supportsFocus;
  bool supportsLoad;

  // Text context behavior
  bool canBeVirtual;       // Can be virtual node inside text context
  bool isTextContainer;    // Establishes text context for children
  bool breaksTextContext;  // Breaks parent's text context (block elements)

  // Tree structure
  bool canHaveChildren;
  bool isLeafNode;
};
```

### ElementCategory enum

```cpp
enum class ElementCategory {
  Container,      // div, main, section, article, nav, header, footer, aside, form
  TextContainer,  // p, h1–h6
  VirtualText,    // span, strong, em, a, br
  Input,          // input, textarea
  Select,         // select
  Image,          // img
  Button,         // button
  List,           // ul, ol
  ListItem,       // li
  HorizontalRule, // hr
  Video,          // video
};
```

### ViewType enum

```cpp
enum class ViewType {
  UIView,          // Standard container
  UIScrollView,    // Scroll container (promoted from div)
  UIImageView,     // Image display
  UITextField,     // Single-line text input
  UITextView,      // Multi-line text input
  TextRenderView,  // Custom text rendering (Core Text)
  Virtual,         // No UIView (virtual text nodes)
};
```

## Element Definitions

### P0 — Core Elements

| Element | Category | View Type | flexDirection | flexShrink | Special |
|---------|----------|-----------|---------------|------------|---------|
| `div` | Container | UIView | column | 0 | — |
| `span` | VirtualText | Virtual* | row | 1 | *Virtual inside text, UIView outside |
| `p` | TextContainer | TextRenderView | column | 0 | marginTop/Bottom: 16 |
| `img` | Image | UIImageView | — | 0 | Leaf node, supports onLoad/onError |
| `button` | Button | UIView | row | 0 | alignItems: center, justifyContent: center |
| `input` | Input | UITextField | — | 0 | height: 32, leaf node |
| `textarea` | Input | UITextView | — | 0 | minHeight: 48, leaf node |

### P1 — Semantic & Text Elements

| Element | Category | View Type | Special |
|---------|----------|-----------|---------|
| `h1` | TextContainer | TextRenderView | fontSize: 32, bold, margin: 21.4 |
| `h2` | TextContainer | TextRenderView | fontSize: 24, bold, margin: 19.9 |
| `h3` | TextContainer | TextRenderView | fontSize: 18.7, bold, margin: 18.7 |
| `h4` | TextContainer | TextRenderView | fontSize: 16, bold, margin: 21.3 |
| `h5` | TextContainer | TextRenderView | fontSize: 13.3, bold, margin: 22.2 |
| `h6` | TextContainer | TextRenderView | fontSize: 10.7, bold, margin: 24.9 |
| `strong` | VirtualText | Virtual | fontWeight: bold |
| `em` | VirtualText | Virtual | fontStyle: italic |
| `a` | VirtualText | Virtual* | *Virtual inline, UIView block; color: systemBlue |
| `main`, `section`, `article`, `nav`, `header`, `footer`, `aside` | Container | UIView | Same as div + accessibility role |
| `ul`, `ol` | List | UIView | paddingLeft: 40, margin: 16 |
| `li` | ListItem | UIView | flexDirection: row |
| `form` | Container | UIView | Same as div |

### P2 — Extended Elements

| Element | Category | View Type | Special |
|---------|----------|-----------|---------|
| `select` | Select | UIView | Opens picker on tap |
| `video` | Video | UIView | AVPlayerLayer |
| `hr` | HorizontalRule | UIView | height: 0, borderTop: 1, margin: 8 |
| `br` | VirtualText | Virtual | Line break in text |

## API

```cpp
class HTMLElementRegistry {
public:
  // O(1) lookup by element type string
  static const ElementDescriptor& get(const std::string& elementType);

  // Check if element type is known
  static bool isKnownElement(const std::string& elementType);

  // List all supported element types
  static std::vector<std::string> getAllElementTypes();
};
```

## Text Context Rules

Text context determines whether inline elements (`<span>`, `<strong>`, `<em>`, `<a>`) become virtual text nodes (no UIView) or real UIView containers.

| Parent Element | Child Element | Result |
|---------------|---------------|--------|
| `<div>` | `<span>` | Real UIView (flexDirection: row) |
| `<p>` | `<span>` | Virtual (attributed string range) |
| `<p>` → `<span>` | `<strong>` | Virtual (bold attribute) |
| `<p>` | `<div>` | **Breaks** text context — real UIView |
| `<h1>` | `<em>` | Virtual (italic attribute) |

Tracked via `HostContext.isInsideTextContext` in the renderer.

## Scroll Promotion

A `<div>` with `style.overflow: 'scroll'` or `style.overflow: 'auto'` is promoted from `UIView` to `UIScrollView` at view creation time. The shadow node checks `hasScrollOverflow_` and `getResolvedViewType()` returns `UIScrollView` instead of `UIView`.

## Prop Mapping

### Common Props (all elements)

| Prop | Target |
|------|--------|
| `style.display` | Yoga `YGDisplay` |
| `style.flexDirection` | Yoga `YGFlexDirection` |
| `style.justifyContent` | Yoga `YGJustify` |
| `style.alignItems` | Yoga `YGAlign` |
| `style.flex*` | Yoga flex properties |
| `style.width/height` | Yoga dimensions |
| `style.margin*` | Yoga margins |
| `style.padding*` | Yoga padding |
| `style.position` | Yoga `YGPositionType` |
| `style.overflow` | Yoga overflow + scroll promotion |
| `style.backgroundColor` | `UIView.backgroundColor` |
| `style.opacity` | `UIView.alpha` |
| `style.borderRadius` | `UIView.layer.cornerRadius` |
| `style.borderWidth/Color` | `UIView.layer.border*` |
| `style.transform` | `UIView.layer.transform` |
| `style.zIndex` | `UIView.layer.zPosition` |
| `onClick` | `UITapGestureRecognizer` |
| `onLayout` | Layout completion callback |
| `id` | `accessibilityIdentifier` |

### Text Props (span, p, h1–h6, strong, em, a)

| Prop | Target |
|------|--------|
| `style.color` | `NSAttributedString.foregroundColor` |
| `style.fontSize` | `UIFont.pointSize` |
| `style.fontWeight` | `UIFont.Weight` |
| `style.fontStyle` | `UIFont` italic trait |
| `style.fontFamily` | `UIFont` family name |
| `style.textDecoration` | `NSAttributedString.underlineStyle` / `strikethroughStyle` |
| `style.textAlign` | `NSParagraphStyle.alignment` |
| `style.lineHeight` | `NSParagraphStyle.minimumLineHeight` |
| `style.letterSpacing` | `NSAttributedString.kern` |

### Element-Specific Props

| Element | Extra Props |
|---------|-------------|
| `img` | `src`, `alt`, `style.objectFit` (→ `contentMode`), `onLoad`, `onError` |
| `input` | `type`, `value`, `placeholder`, `onChange`, `onFocus`, `onBlur`, `disabled` |
| `textarea` | `value`, `placeholder`, `rows`, `onChange`, `onFocus`, `onBlur` |
| `button` | `disabled`, `onClick` |
| `a` | `href`, `onClick` |
| `select` | `value`, `onChange`, `disabled` |

## Accessibility Mapping

| Element | iOS Trait | `isAccessibilityElement` |
|---------|-----------|--------------------------|
| `div` | None | `false` |
| `p` | `.staticText` | `true` |
| `h1`–`h6` | `.header` | `true` |
| `button` | `.button` | `true` |
| `a` | `.link` | `true` |
| `img` | `.image` | `true` (if `alt` provided) |
| `input` | Built-in | `true` |
| `nav` | Landmark | `false` |

## Integration Points

- **Renderer**: `getChildHostContext` uses registry to determine text context
- **Bridge**: `$$createNode` calls `HTMLElementRegistry::get(type)` to configure shadow node
- **Yoga Layout**: Yoga defaults from `ElementDescriptor.yogaDefaults`
- **View Factory**: `getResolvedViewType()` determines UIKit class to instantiate
