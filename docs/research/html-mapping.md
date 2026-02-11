# Research: HTML Element to Native View Mapping

## Overview

This document defines how HTML elements map to UIKit views, Yoga layout defaults, and prop transformations. The goal is to let developers write `<div>`, `<span>`, `<p>`, etc. and have them render as native iOS views with web-like layout semantics.

### Design Principles

1. **Web-first defaults**: Elements should behave like their browser counterparts by default (block vs inline, text styling, etc.)
2. **Minimal UIKit surface**: Use the smallest set of UIKit classes that can cover all elements
3. **Yoga for layout**: All layout is handled by Yoga with CSS-like defaults per element type
4. **Progressive enhancement**: Start with a small element set (P0), expand over time

---

## React Native Patterns (Reference)

React Native maps components to native views through a **component registry** pattern:

1. **NativeComponentRegistry.get(name, viewConfigProvider)** registers a component name (e.g., `'RCTView'`) with a static view config
2. **View configs** define: `uiViewClassName`, `bubblingEventTypes`, `directEventTypes`, `validAttributes`
3. **BaseViewConfig (iOS)** provides shared props for all views: touch events, pointer events, accessibility, layout (flex, margin, padding, border, position), style attributes
4. **Each native component** extends the base with component-specific attributes (e.g., `RCTText` adds `numberOfLines`, `ellipsizeMode`; `RCTImageView` adds `source`, `resizeMode`)

### Key RN Component -> UIKit Mappings

| RN Component | Native Class | UIKit Base |
|---|---|---|
| `RCTView` | `RCTView` | `UIView` |
| `RCTText` | `RCTTextView` | `UIView` (custom text rendering) |
| `RCTVirtualText` | `RCTVirtualTextView` | Virtual (no UIView) |
| `RCTImageView` | `RCTImageView` | `UIImageView` |
| `RCTScrollView` | `RCTScrollView` | `UIScrollView` |
| `RCTSinglelineTextInputView` | `RCTTextInput` | `UITextField` |
| `RCTMultilineTextInputView` | `RCTTextInput` | `UITextView` |

### Key Takeaways from RN Architecture

- RN does NOT use `UILabel` for text; it renders text using Core Text / TextKit within a custom `UIView` subclass. This gives full control over text layout, inline spans, and nested text. We should follow the same pattern.
- `RCTVirtualText` is a "virtual" node with no backing UIView -- used for nested `<Text>` spans. We need this for `<span>`, `<strong>`, `<em>` inside text.
- RN uses a Shadow Tree (Yoga) that runs on a background thread, separate from the UIKit view tree. Layout results are applied to UIViews on the main thread.
- View configs are static when possible, with runtime validation as a fallback.

---

## Element Mapping Matrix

### P0 -- Core (implement first)

These are the minimum viable set to render any basic UI.

| HTML Element | UIKit Class | Yoga Display | Yoga flexDirection | Notes |
|---|---|---|---|---|
| `<div>` | `UIView` | `flex` | `column` | The universal container. Block-level. |
| `<span>` | Virtual (no UIView) | `inline` | `row` | Inline text wrapper. Virtual node when inside text context; UIView with `flexDirection: row` otherwise. |
| `<p>` | `UIView` + text rendering | `flex` | `column` | Block-level text container. Renders text via Core Text. Has default vertical margin. |
| `<img>` | `UIImageView` | `flex` | N/A | Replaced element. Intrinsic size from image. |
| `<button>` | `UIView` (custom) | `flex` | `row` | Not UIButton -- we need full layout control. Gesture recognizer for press. |
| `<input>` | `UITextField` | `flex` | N/A | Single-line text input. |
| `<textarea>` | `UITextView` | `flex` | N/A | Multi-line text input. |
| (text node) | Virtual | `inline` | N/A | Raw text content. Rendered by parent text container via Core Text. |

### P1 -- Semantic Layout (implement second)

These all map to `UIView` like `<div>` but carry semantic/accessibility meaning.

| HTML Element | UIKit Class | Yoga Display | Yoga flexDirection | Notes |
|---|---|---|---|---|
| `<main>` | `UIView` | `flex` | `column` | Same as `<div>`. Sets `accessibilityTraits` for main content. |
| `<section>` | `UIView` | `flex` | `column` | Same as `<div>`. Semantic grouping. |
| `<article>` | `UIView` | `flex` | `column` | Same as `<div>`. Semantic grouping. |
| `<nav>` | `UIView` | `flex` | `column` | Same as `<div>`. `accessibilityTraits = .tabBar` or landmark. |
| `<header>` | `UIView` | `flex` | `column` | Same as `<div>`. Accessibility landmark. |
| `<footer>` | `UIView` | `flex` | `column` | Same as `<div>`. Accessibility landmark. |
| `<aside>` | `UIView` | `flex` | `column` | Same as `<div>`. Accessibility landmark. |
| `<h1>` - `<h6>` | `UIView` + text rendering | `flex` | `column` | Block-level text. `accessibilityTraits = .header`. Default bold, scaled font sizes. |
| `<strong>` | Virtual | `inline` | N/A | Virtual text node. Applies `fontWeight: bold` to contained text. |
| `<em>` | Virtual | `inline` | N/A | Virtual text node. Applies `fontStyle: italic` to contained text. |
| `<a>` | Virtual / `UIView` | `inline` / `flex` | N/A / `row` | Virtual when inside text (tappable text span). UIView when block-level. `accessibilityTraits = .link`. |
| `<ul>` | `UIView` | `flex` | `column` | List container. Default left padding for indent. |
| `<ol>` | `UIView` | `flex` | `column` | List container. Manages counter for numbering. |
| `<li>` | `UIView` | `flex` | `row` | List item. Prepends bullet/number via virtual text node. |

### P2 -- Extended (implement later)

| HTML Element | UIKit Class | Yoga Display | Yoga flexDirection | Notes |
|---|---|---|---|---|
| `<select>` | `UIView` (custom picker) | `flex` | `row` | Opens `UIPickerView` or action sheet on tap. |
| `<video>` | `AVPlayerLayer` in `UIView` | `flex` | N/A | Replaced element. Uses AVFoundation. |
| `<hr>` | `UIView` | `flex` | N/A | 1px height, full width, gray background. |
| `<br>` | Virtual | N/A | N/A | Forces line break in text context. |
| `<table>` | `UIView` | `flex` | `column` | Table layout via nested flex. |
| `<tr>` | `UIView` | `flex` | `row` | Table row. |
| `<td>` / `<th>` | `UIView` | `flex` | `column` | Table cell. `<th>` gets bold + header trait. |
| `<form>` | `UIView` | `flex` | `column` | Same as div. Semantic grouping. |
| `<label>` | Virtual / `UIView` | `inline` / `flex` | N/A | Associates with input for accessibility. |
| `<progress>` | `UIProgressView` | `flex` | N/A | Native progress bar. |

---

## Props Mapping Per Element

### Common Props (all elements)

These map directly from HTML/CSS concepts to UIKit + Yoga, inherited from the base view config.

| HTML Prop / CSS Property | Yoga / UIKit Property | Transform |
|---|---|---|
| `style.display` | `YGNodeStyleSetDisplay` | `'flex'` -> `YGDisplayFlex`, `'none'` -> `YGDisplayNone` |
| `style.flexDirection` | `YGNodeStyleSetFlexDirection` | `'row'` / `'column'` / `'row-reverse'` / `'column-reverse'` |
| `style.justifyContent` | `YGNodeStyleSetJustifyContent` | CSS value -> YGJustify enum |
| `style.alignItems` | `YGNodeStyleSetAlignItems` | CSS value -> YGAlign enum |
| `style.alignSelf` | `YGNodeStyleSetAlignSelf` | CSS value -> YGAlign enum |
| `style.flexWrap` | `YGNodeStyleSetFlexWrap` | `'wrap'` / `'nowrap'` |
| `style.flex` | `YGNodeStyleSetFlex` | Number |
| `style.flexGrow` | `YGNodeStyleSetFlexGrow` | Number |
| `style.flexShrink` | `YGNodeStyleSetFlexShrink` | Number |
| `style.flexBasis` | `YGNodeStyleSetFlexBasis` | Number or `'auto'` |
| `style.width` / `height` | `YGNodeStyleSetWidth` / `Height` | Number (px) or `'%'` or `'auto'` |
| `style.minWidth` / `maxWidth` | `YGNodeStyleSetMinWidth` / `MaxWidth` | Number or `'%'` |
| `style.minHeight` / `maxHeight` | `YGNodeStyleSetMinHeight` / `MaxHeight` | Number or `'%'` |
| `style.margin*` | `YGNodeStyleSetMargin` | Number, `'%'`, or `'auto'` |
| `style.padding*` | `YGNodeStyleSetPadding` | Number or `'%'` |
| `style.position` | `YGNodeStyleSetPositionType` | `'relative'` (default) / `'absolute'` |
| `style.top/right/bottom/left` | `YGNodeStyleSetPosition` | Number or `'%'` |
| `style.gap` / `rowGap` / `columnGap` | `YGNodeStyleSetGap` | Number |
| `style.overflow` | `YGNodeStyleSetOverflow` + `clipsToBounds` | `'visible'` / `'hidden'` / `'scroll'` |
| `style.aspectRatio` | `YGNodeStyleSetAspectRatio` | Number |
| `style.backgroundColor` | `UIView.backgroundColor` | CSS color string -> `UIColor` |
| `style.opacity` | `UIView.alpha` | Number 0-1 |
| `style.borderRadius` | `UIView.layer.cornerRadius` | Number |
| `style.borderWidth` | `UIView.layer.borderWidth` | Number |
| `style.borderColor` | `UIView.layer.borderColor` | CSS color string -> `CGColor` |
| `style.borderStyle` | Custom border drawing | `'solid'` / `'dashed'` / `'dotted'` |
| `style.transform` | `UIView.transform` / `layer.transform` | CSS transform -> `CATransform3D` |
| `style.zIndex` | `UIView.layer.zPosition` | Number |
| `id` | `nativeID` / `accessibilityIdentifier` | String |
| `className` | Style lookup | Resolved to style object at build time |
| `onClick` | `UITapGestureRecognizer` | Callback |
| `onTouchStart` | Touch event handler | Callback |
| `onTouchEnd` | Touch event handler | Callback |
| `onTouchMove` | Touch event handler | Callback |
| `onLayout` | Layout completion callback | Receives `{x, y, width, height}` |

### `<div>` Props

No additional props beyond common. It is the base container.

### `<span>` Props

When inside a text context (virtual node):

| HTML Prop | Native Property | Transform |
|---|---|---|
| `style.color` | Text attribute: `foregroundColor` | CSS color -> `UIColor` |
| `style.fontSize` | Text attribute: `font.pointSize` | Number |
| `style.fontWeight` | Text attribute: `font.weight` | `'bold'` / `'normal'` / `'100'`-`'900'` -> `UIFont.Weight` |
| `style.fontStyle` | Text attribute: `font.italic` | `'italic'` / `'normal'` |
| `style.fontFamily` | Text attribute: `font.familyName` | Font name string |
| `style.textDecoration` | Text attribute: `underlineStyle` / `strikethroughStyle` | `'underline'` / `'line-through'` / `'none'` |
| `style.textTransform` | Applied to text content | `'uppercase'` / `'lowercase'` / `'capitalize'` / `'none'` |
| `style.letterSpacing` | Text attribute: `kern` | Number |
| `style.lineHeight` | Paragraph style: `lineSpacing` | Number |

### `<p>` Props

Same text props as `<span>`, plus:

| HTML Prop | Native Property | Transform |
|---|---|---|
| `style.textAlign` | Paragraph style: `alignment` | `'left'` / `'center'` / `'right'` / `'justify'` -> `NSTextAlignment` |
| `style.lineHeight` | Paragraph style: `minimumLineHeight` | Number |
| (default margin) | Yoga margin top/bottom | `1em` equivalent (~16px) |

### `<h1>` - `<h6>` Props

Same as `<p>`, with scaled defaults:

| Element | Default fontSize | Default fontWeight | Default margin (top/bottom) |
|---|---|---|---|
| `<h1>` | 32 | `bold` (700) | 21.4 / 21.4 |
| `<h2>` | 24 | `bold` (700) | 19.9 / 19.9 |
| `<h3>` | 18.7 | `bold` (700) | 18.7 / 18.7 |
| `<h4>` | 16 | `bold` (700) | 21.3 / 21.3 |
| `<h5>` | 13.3 | `bold` (700) | 22.2 / 22.2 |
| `<h6>` | 10.7 | `bold` (700) | 24.9 / 24.9 |

(These match the browser default `2em`, `1.5em`, `1.17em`, `1em`, `0.83em`, `0.67em` font sizes at base 16px, and the corresponding `0.67em` - `2.33em` margins.)

### `<img>` Props

| HTML Prop | Native Property | Transform |
|---|---|---|
| `src` | `UIImageView.image` | URL string -> async image load -> `UIImage` |
| `alt` | `accessibilityLabel` | String |
| `width` | Yoga `width` | Number (intrinsic from image if not set) |
| `height` | Yoga `height` | Number (intrinsic from image if not set) |
| `style.objectFit` | `UIImageView.contentMode` | `'cover'` -> `.scaleAspectFill`, `'contain'` -> `.scaleAspectFit`, `'fill'` -> `.scaleToFill`, `'none'` -> `.center` |
| `onLoad` | Image load completion | Callback |
| `onError` | Image load error | Callback |
| `loading` | Lazy loading flag | `'lazy'` defers load until near viewport |

### `<button>` Props

| HTML Prop | Native Property | Transform |
|---|---|---|
| `onClick` | `UITapGestureRecognizer` | Callback |
| `disabled` | `userInteractionEnabled = false`, visual dimming | Boolean |
| `type` | Semantic only (no form support initially) | `'button'` / `'submit'` / `'reset'` |
| (default style) | Background color, border radius, centered text | Matches web button defaults |

### `<input>` Props

| HTML Prop | Native Property | Transform |
|---|---|---|
| `type` | Input behavior | `'text'` (default), `'password'` -> `secureTextEntry`, `'email'` -> `keyboardType = .emailAddress`, `'number'` -> `keyboardType = .numberPad`, `'tel'` -> `keyboardType = .phonePad`, `'url'` -> `keyboardType = .URL` |
| `value` | `UITextField.text` | String |
| `defaultValue` | Initial `UITextField.text` | String |
| `placeholder` | `UITextField.placeholder` | String |
| `onChange` | `UITextField` delegate / target-action | Callback with `{value}` |
| `onFocus` | `UITextField` delegate `textFieldDidBeginEditing` | Callback |
| `onBlur` | `UITextField` delegate `textFieldDidEndEditing` | Callback |
| `onSubmit` | `UITextField` delegate `textFieldShouldReturn` | Callback |
| `maxLength` | `UITextField` delegate character limit | Number |
| `autoCapitalize` | `UITextField.autocapitalizationType` | `'none'` / `'sentences'` / `'words'` / `'characters'` |
| `autoCorrect` | `UITextField.autocorrectionType` | Boolean -> `.yes` / `.no` |
| `autoFocus` | `becomeFirstResponder()` on mount | Boolean |
| `disabled` | `UITextField.isEnabled` | Boolean |
| `readOnly` | `UITextField.isEnabled` (no editing) | Boolean |

### `<textarea>` Props

Same as `<input>` but using `UITextView` instead of `UITextField`, plus:

| HTML Prop | Native Property | Transform |
|---|---|---|
| `rows` | Initial height calculation | Number -> height = rows * lineHeight |
| `onChange` | `UITextView` delegate `textViewDidChange` | Callback with `{value}` |

### `<a>` Props

| HTML Prop | Native Property | Transform |
|---|---|---|
| `href` | Tap handler -> URL open | String URL |
| `onClick` | Tap gesture / press handler | Callback (can `preventDefault`) |
| `target` | Ignored (always in-app or system browser) | `'_blank'` -> open in Safari |
| (default style) | Blue color, underline | `color: systemBlue`, `textDecoration: underline` |

### `<ul>` / `<ol>` Props

| HTML Prop | Native Property | Transform |
|---|---|---|
| `style.listStyleType` | Bullet/number style | `'disc'` / `'circle'` / `'square'` / `'decimal'` / `'none'` |
| `start` (ol only) | Starting counter value | Number |
| (default style) | Left padding 40px | Yoga `paddingLeft: 40` |

### `<li>` Props

| HTML Prop | Native Property | Transform |
|---|---|---|
| `value` (in ol) | Override counter value | Number |
| (marker) | Prepended virtual text node | Bullet character or counter number |

### `<select>` Props (P2)

| HTML Prop | Native Property | Transform |
|---|---|---|
| `value` | Selected option | String |
| `onChange` | Selection callback | Callback with `{value}` |
| `disabled` | `userInteractionEnabled = false` | Boolean |
| `children` (`<option>`) | Picker data source | Array of `{value, label}` |

---

## CSS Defaults Per Element

These defaults match browser user-agent stylesheet behavior. They are applied automatically when an element is created, before any user styles.

### Block Elements

```javascript
// <div>, <main>, <section>, <article>, <nav>, <header>, <footer>, <aside>, <form>
{
  display: 'flex',           // Yoga: YGDisplayFlex
  flexDirection: 'column',   // Yoga: YGFlexDirectionColumn
  flexShrink: 0,             // Web default (unlike RN which defaults to 1)
  alignItems: 'stretch',     // Yoga default
  // position: 'relative',   // Yoga default
  // overflow: 'visible',    // Yoga default
}

// <p>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  marginTop: 16,             // 1em at base 16px
  marginBottom: 16,
}

// <h1>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  fontSize: 32,              // 2em
  fontWeight: 'bold',
  marginTop: 21.4,           // 0.67em at 32px
  marginBottom: 21.4,
}

// <h2>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  fontSize: 24,              // 1.5em
  fontWeight: 'bold',
  marginTop: 19.9,           // 0.83em at 24px
  marginBottom: 19.9,
}

// <h3>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  fontSize: 18.7,            // 1.17em
  fontWeight: 'bold',
  marginTop: 18.7,           // 1em at 18.7px
  marginBottom: 18.7,
}

// <h4>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  fontSize: 16,              // 1em
  fontWeight: 'bold',
  marginTop: 21.3,           // 1.33em at 16px
  marginBottom: 21.3,
}

// <h5>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  fontSize: 13.3,            // 0.83em
  fontWeight: 'bold',
  marginTop: 22.2,           // 1.67em at 13.3px
  marginBottom: 22.2,
}

// <h6>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  fontSize: 10.7,            // 0.67em
  fontWeight: 'bold',
  marginTop: 24.9,           // 2.33em at 10.7px
  marginBottom: 24.9,
}

// <ul>, <ol>
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  paddingLeft: 40,           // Browser default indent
  marginTop: 16,
  marginBottom: 16,
}

// <li>
{
  display: 'flex',
  flexDirection: 'row',
  flexShrink: 0,
}

// <hr>
{
  display: 'flex',
  flexShrink: 0,
  height: 0,                 // Content height 0
  borderTopWidth: 1,
  borderTopColor: '#808080',
  borderStyle: 'inset',
  marginTop: 8,              // 0.5em
  marginBottom: 8,
}
```

### Inline / Text Elements

```javascript
// <span> (outside text context -- rare, when used as flex child)
{
  display: 'flex',
  flexDirection: 'row',
  flexShrink: 1,
}
// <span> inside text context: virtual node, no Yoga defaults needed

// <strong>
{
  // Virtual text node
  fontWeight: 'bold',        // 700
}

// <em>
{
  // Virtual text node
  fontStyle: 'italic',
}

// <a>
{
  // Virtual text node (when inline) or flex container (when block)
  color: '#007AFF',          // iOS system blue
  textDecorationLine: 'underline',
}
```

### Replaced / Interactive Elements

```javascript
// <img>
{
  display: 'flex',
  flexShrink: 0,
  // width/height: intrinsic from loaded image if not specified
  objectFit: 'fill',         // Default contentMode
}

// <button>
{
  display: 'flex',
  flexDirection: 'row',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 12,
  paddingRight: 12,
  borderRadius: 4,
  borderWidth: 1,
  borderColor: '#767676',
  backgroundColor: '#EFEFEF',
  // Text defaults: fontSize 13.3, fontFamily: system
}

// <input>
{
  display: 'flex',
  flexShrink: 0,
  height: 32,                // Approximate browser default
  paddingLeft: 4,
  paddingRight: 4,
  borderWidth: 1,
  borderColor: '#767676',
  borderRadius: 2,
  fontSize: 13.3,
  backgroundColor: '#FFFFFF',
}

// <textarea>
{
  display: 'flex',
  flexShrink: 0,
  minHeight: 48,
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 4,
  paddingRight: 4,
  borderWidth: 1,
  borderColor: '#767676',
  borderRadius: 2,
  fontSize: 13.3,
  backgroundColor: '#FFFFFF',
}

// <select>
{
  display: 'flex',
  flexDirection: 'row',
  flexShrink: 0,
  alignItems: 'center',
  height: 32,
  paddingLeft: 4,
  paddingRight: 4,
  borderWidth: 1,
  borderColor: '#767676',
  borderRadius: 2,
  backgroundColor: '#FFFFFF',
}
```

### Scroll Container

The `<div>` with `style.overflow: 'scroll'` or `style.overflowY: 'scroll'` should automatically upgrade to `UIScrollView`:

```javascript
// <div style={{overflow: 'scroll'}}>  ->  UIScrollView
{
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  // UIScrollView-specific:
  // scrollEnabled: true,
  // showsVerticalScrollIndicator: true,
  // bounces: true,
}
```

---

## Text Rendering Architecture

### The Text Context Problem

In the browser, text rendering handles inline elements natively -- `<span>`, `<strong>`, `<em>`, `<a>` can be nested inside `<p>` and text flows naturally. In native iOS, this requires a custom approach.

### Solution: Virtual Text Nodes + Core Text

Following React Native's proven pattern:

1. **Text Container Elements** (`<p>`, `<h1>`-`<h6>`): These are "text hosts." They own a Core Text / TextKit renderer.
2. **Virtual Text Nodes** (`<span>`, `<strong>`, `<em>`, `<a>` when inside a text container): These do NOT create UIViews. Instead, they contribute `NSAttributedString` attributes to the parent text container.
3. **Raw Text Nodes** (string children): The actual text content. Becomes attributed string segments.

### Text Rendering Flow

```
<p>Hello <strong>world</strong> and <a href="...">click here</a></p>

1. Reconciler creates: p -> [text("Hello "), strong -> [text("world")], text(" and "), a -> [text("click here")]]
2. Text container (p) collects all descendants into NSAttributedString:
   - "Hello "       -> {font: system-16, color: black}
   - "world"        -> {font: system-16-bold, color: black}
   - " and "        -> {font: system-16, color: black}
   - "click here"   -> {font: system-16, color: blue, underline: true, link: URL}
3. Core Text renders the complete attributed string in one pass
4. Hit testing on the rendered text detects taps on the <a> region
```

### Context Detection

An element's behavior depends on whether it is inside a text context:

| Element | Outside Text Context | Inside Text Context |
|---|---|---|
| `<span>` | `UIView` with `flexDirection: row` | Virtual (text attributes only) |
| `<strong>` | `UIView` with bold text | Virtual (bold attribute) |
| `<em>` | `UIView` with italic text | Virtual (italic attribute) |
| `<a>` | `UIView` with tap handler | Virtual (link attribute + hit region) |
| `<div>` | `UIView` | **Breaks text context** -- creates new UIView |

Text context is established by `<p>`, `<h1>`-`<h6>`, and propagated through `<span>`, `<strong>`, `<em>`, `<a>`. A `<div>` inside a `<p>` breaks out of text context and becomes a real UIView.

---

## Accessibility Mapping

| HTML Element | iOS Accessibility Trait | `isAccessibilityElement` |
|---|---|---|
| `<div>` | None | `false` (container) |
| `<p>` | `.staticText` | `true` |
| `<h1>`-`<h6>` | `.header` | `true` |
| `<button>` | `.button` | `true` |
| `<a>` | `.link` | `true` |
| `<img>` | `.image` | `true` (if `alt` provided) |
| `<input>` | None (text field has built-in) | `true` |
| `<textarea>` | None (text view has built-in) | `true` |
| `<nav>` | None (container landmark) | `false` |
| `<main>` | None (container landmark) | `false` |
| `<header>` | `.header` (for landmark) | `false` |
| `<footer>` | None (container landmark) | `false` |
| `<ul>` / `<ol>` | None | `false` |
| `<li>` | None | `true` |
| `<select>` | `.adjustable` | `true` |

### ARIA Prop Mapping

| HTML Attribute | iOS Property |
|---|---|
| `aria-label` | `accessibilityLabel` |
| `aria-hidden` | `accessibilityElementsHidden` |
| `aria-disabled` | `accessibilityTraits |= .notEnabled` |
| `aria-selected` | `accessibilityTraits |= .selected` |
| `aria-checked` | `accessibilityValue = {text: "checked"/"unchecked"}` |
| `role` | Maps to `accessibilityTraits` (see RN's role mapping above) |
| `tabIndex` | `isAccessibilityElement` (0 = yes, -1 = no) |

---

## Component Registry Design

Based on the React Native pattern, our registry should:

```javascript
// packages/components/src/registry.js

const elementConfigs = {
  div: {
    nativeClass: 'NativeView',           // UIView
    yogaDefaults: { flexDirection: 'column', flexShrink: 0 },
    validProps: [...commonProps],
    accessibilityRole: null,
  },
  p: {
    nativeClass: 'NativeTextView',       // Custom text rendering UIView
    yogaDefaults: { flexDirection: 'column', flexShrink: 0, marginTop: 16, marginBottom: 16 },
    validProps: [...commonProps, ...textProps],
    accessibilityRole: 'text',
    isTextContainer: true,
  },
  span: {
    nativeClass: null,                   // Virtual by default
    yogaDefaults: {},
    validProps: [...textProps],
    isVirtualText: true,
    fallbackNativeClass: 'NativeView',   // When outside text context
    fallbackYogaDefaults: { flexDirection: 'row', flexShrink: 1 },
  },
  img: {
    nativeClass: 'NativeImageView',      // UIImageView
    yogaDefaults: { flexShrink: 0 },
    validProps: [...commonProps, 'src', 'alt', 'objectFit', 'onLoad', 'onError', 'loading'],
    accessibilityRole: 'image',
  },
  button: {
    nativeClass: 'NativeView',
    yogaDefaults: { flexDirection: 'row', flexShrink: 0, alignItems: 'center', justifyContent: 'center', padding: 4, paddingHorizontal: 12 },
    validProps: [...commonProps, 'disabled', 'type'],
    accessibilityRole: 'button',
    defaultGestures: ['tap'],
  },
  input: {
    nativeClass: 'NativeTextInput',      // UITextField
    yogaDefaults: { flexShrink: 0, height: 32, paddingHorizontal: 4 },
    validProps: [...commonProps, ...inputProps],
    accessibilityRole: null,             // UITextField handles this
  },
  // ... etc
};
```

---

## Key Differences from Web CSS Defaults

Since we use Yoga (flexbox) for all layout, some web defaults need adaptation:

| Web Behavior | Our Adaptation |
|---|---|
| `display: block` (div, p, h1, etc.) | `display: flex; flexDirection: column` |
| `display: inline` (span, a, strong, em) | Virtual text node (no UIView) or `display: flex; flexDirection: row` |
| `display: inline-block` | `flexDirection: row` with flex wrapping in parent |
| `box-sizing: content-box` (web default) | `box-sizing: border-box` (our default, matches modern CSS practice and RN) |
| `flexShrink: 1` (CSS default) | `flexShrink: 0` for block elements (matches web `display: block` behavior where elements don't shrink); `flexShrink: 1` for inline/span |
| Block elements take full width | `alignSelf: stretch` (Yoga default for children of column flex container) handles this naturally |
| Margin collapsing | NOT supported (Yoga does not support margin collapsing). Document this difference. |
| `overflow: visible` (web default) | Same -- `overflow: visible` is Yoga default |
| `position: static` (web default) | `position: relative` (Yoga default). No `static` in Yoga. Functionally equivalent for most cases. |
| Text wraps by default | Yoga `flexWrap: nowrap` is default. Text wrapping handled by Core Text within text containers. |
| `em` / `rem` units | Convert to px at resolution time (1em = parent font size, 1rem = 16px root). |

---

## Priority Implementation Order

### P0 -- Minimum Viable Rendering

1. `<div>` -- The foundation. Everything depends on this.
2. Raw text nodes -- Must render text content.
3. `<p>` -- Text container with Core Text rendering.
4. `<span>` (virtual) -- Inline text styling.
5. `<strong>`, `<em>` -- Virtual text modifiers.
6. `<img>` -- Image loading and display.
7. `<button>` -- Interactive element with tap handling.
8. `<input>` (type=text) -- Text input.
9. Scroll container (`overflow: scroll`) -- Needed for any content longer than the screen.

### P1 -- Semantic HTML

10. `<h1>` - `<h6>` -- Heading text with scaled sizes.
11. `<a>` -- Links (virtual in text, tappable).
12. `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<aside>` -- Semantic containers (all identical to `<div>` except for accessibility).
13. `<ul>`, `<ol>`, `<li>` -- Lists with bullets/numbers.
14. `<textarea>` -- Multi-line text input.

### P2 -- Extended

15. `<select>` + `<option>` -- Dropdown picker.
16. `<video>` -- Media playback.
17. `<hr>`, `<br>` -- Formatting elements.
18. `<table>`, `<tr>`, `<td>`, `<th>` -- Table layout.
19. `<form>`, `<label>` -- Form semantics.
20. `<progress>` -- Progress indicator.
21. Additional input types (`checkbox`, `radio`, `range`).

---

## Open Questions

1. **Font system**: Use iOS system font (San Francisco) as default? Support custom font loading via `@font-face` equivalent?
2. **Color system**: Support full CSS color syntax (`#hex`, `rgb()`, `hsl()`, `named colors`)? Or start with hex + named only?
3. **Dark mode**: Should elements automatically adapt to iOS dark mode? (e.g., default text color white on dark, black on light)
4. **Scroll detection**: How to determine when `overflow: scroll` should promote a `<div>` to `UIScrollView`? At reconciler level or at component level?
5. **Text measurement**: Core Text measurement for intrinsic text sizing must integrate with Yoga's `measureFunc`. Follow RN's pattern of registering a measure function per text node.
6. **Inline images**: Can `<img>` inside `<p>` work as an inline element? (Would need `NSTextAttachment` in the attributed string.)
7. **Event bubbling**: Follow DOM event bubbling model? Or React's synthetic event system? (React's reconciler handles this via `react-reconciler`.)
