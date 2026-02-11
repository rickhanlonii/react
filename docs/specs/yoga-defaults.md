# Spec: Yoga Layout Defaults

## Overview

Yoga layout defaults are applied per HTML element type to emulate CSS browser defaults using Yoga's flexbox engine. Defaults are applied in the `HTMLShadowNode` constructor before any user-supplied style props.

## Module

- C++: Applied in `HTMLShadowNode::applyYogaDefaults()`
- Config: `ios/Native/Registry/HTMLElementRegistry.cpp` (YogaDefaults struct per element)

## Global Config

```c
YGConfigRef config = YGConfigNew();
YGConfigSetPointScaleFactor(config, UIScreen.main.scale);  // 2.0 or 3.0
YGConfigSetErrata(config, YGErrataNone);                   // Full W3C conformance
// Do NOT enable YGConfigSetUseWebDefaults — Yoga's column default matches <div>
```

Key decisions:
- **No `useWebDefaults`**: Yoga's default `flexDirection: column` matches `<div>` block layout
- **`border-box` sizing**: Yoga defaults to `border-box` (matches modern CSS resets)
- **`pointScaleFactor`**: Set to device scale for pixel-perfect rounding

## Default Values by Element

### Block Container Elements

`<div>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<form>`

```
flexDirection:  Column     (Yoga default — matches CSS block)
flexShrink:     0          (Yoga default — block elements don't shrink)
flexGrow:       0          (Yoga default)
alignItems:     Stretch    (Yoga default — children fill cross axis)
alignContent:   FlexStart  (Yoga default)
positionType:   Relative   (Yoga default)
overflow:       Visible    (Yoga default)
boxSizing:      BorderBox  (Yoga default)
```

No explicit Yoga calls needed — all match Yoga defaults.

### Paragraph `<p>`

```
flexDirection:  Column
flexShrink:     0
marginTop:      16.0       (1em at 16px base)
marginBottom:   16.0
```

Text container: `YGNodeSetMeasureFunc` for Core Text measurement. `YGNodeSetNodeType(node, YGNodeTypeText)`.

### Headings `<h1>` – `<h6>`

| Element | fontSize | marginTop | marginBottom |
|---------|----------|-----------|--------------|
| `h1` | 32.0 (2em) | 21.4 (0.67em) | 21.4 |
| `h2` | 24.0 (1.5em) | 19.9 (0.83em) | 19.9 |
| `h3` | 18.7 (1.17em) | 18.7 (1em) | 18.7 |
| `h4` | 16.0 (1em) | 21.3 (1.33em) | 21.3 |
| `h5` | 13.3 (0.83em) | 22.2 (1.67em) | 22.2 |
| `h6` | 10.7 (0.67em) | 24.9 (2.33em) | 24.9 |

All headings:
```
flexDirection:  Column
flexShrink:     0
fontWeight:     Bold (700)
```

Text container with measure function.

### Inline Text Elements

`<span>` (outside text context — rendered as UIView):
```
flexDirection:  Row
flexShrink:     1
```

`<span>` (inside text context): Virtual node — no Yoga node created in view tree. Contributes to parent's `NSAttributedString`.

`<strong>`, `<em>`, `<a>`, `<br>`: Always virtual inside text context. No Yoga defaults applied.

### Lists

`<ul>`, `<ol>`:
```
flexDirection:  Column
flexShrink:     0
paddingLeft:    40.0       (browser default indent)
marginTop:      16.0
marginBottom:   16.0
```

`<li>`:
```
flexDirection:  Row
flexShrink:     0
```

### Interactive Elements

`<button>`:
```
flexDirection:     Row
flexShrink:        0
alignItems:        Center
justifyContent:    Center
paddingTop:        4.0
paddingBottom:     4.0
paddingLeft:       12.0
paddingRight:      12.0
```

`<input>`:
```
flexShrink:   0
height:       32.0
paddingLeft:  4.0
paddingRight: 4.0
```

Leaf node — no children, no Yoga child nodes.

`<textarea>`:
```
flexShrink:     0
minHeight:      48.0
paddingTop:     4.0
paddingBottom:  4.0
paddingLeft:    4.0
paddingRight:   4.0
```

`<select>`:
```
flexDirection:  Row
flexShrink:     0
alignItems:     Center
height:         32.0
paddingLeft:    4.0
paddingRight:   4.0
```

### Media Elements

`<img>`:
```
flexShrink: 0
```

Leaf node with intrinsic dimensions from loaded image.

### Formatting

`<hr>`:
```
flexShrink:     0
height:         0
marginTop:      8.0        (0.5em)
marginBottom:   8.0
```

Border applied via UIKit: `borderTopWidth: 1, borderTopColor: #808080`.

## Style Prop Application Order

1. **Element defaults** applied in constructor via `applyYogaDefaults()`
2. **User style props** applied via `applyStyleProps()` — override defaults
3. **Layout calculation** triggered by `YGNodeCalculateLayout()` during commit

## CSS-to-Yoga Prop Mapping

| CSS Property | Yoga API | Notes |
|-------------|----------|-------|
| `display: flex\|none` | `YGNodeStyleSetDisplay` | Only `flex` and `none` supported |
| `flex-direction` | `YGNodeStyleSetFlexDirection` | `row`, `column`, `row-reverse`, `column-reverse` |
| `justify-content` | `YGNodeStyleSetJustifyContent` | Standard flex values |
| `align-items` | `YGNodeStyleSetAlignItems` | Standard flex values |
| `align-self` | `YGNodeStyleSetAlignSelf` | Standard flex values |
| `flex-wrap` | `YGNodeStyleSetFlexWrap` | `wrap`, `nowrap` |
| `flex` | `YGNodeStyleSetFlex` | Shorthand |
| `flex-grow` | `YGNodeStyleSetFlexGrow` | Number |
| `flex-shrink` | `YGNodeStyleSetFlexShrink` | Number |
| `flex-basis` | `YGNodeStyleSetFlexBasis` | Number, percent, or `auto` |
| `width/height` | `YGNodeStyleSetWidth/Height` | Number, percent, or `auto` |
| `min-width/height` | `YGNodeStyleSetMinWidth/Height` | Number or percent |
| `max-width/height` | `YGNodeStyleSetMaxWidth/Height` | Number or percent |
| `margin-*` | `YGNodeStyleSetMargin` | Number, percent, or `auto` |
| `padding-*` | `YGNodeStyleSetPadding` | Number or percent |
| `position` | `YGNodeStyleSetPositionType` | `relative` or `absolute` |
| `top/right/bottom/left` | `YGNodeStyleSetPosition` | Number or percent |
| `gap/row-gap/column-gap` | `YGNodeStyleSetGap` | Number |
| `aspect-ratio` | `YGNodeStyleSetAspectRatio` | Number |
| `overflow` | `YGNodeStyleSetOverflow` | `visible`, `hidden`, `scroll` |

## Text Measurement

Text containers (`<p>`, `<h1>`–`<h6>`) register a Yoga measure function:

```c
YGSize textMeasureFunc(
    YGNodeConstRef node,
    float width, YGMeasureMode widthMode,
    float height, YGMeasureMode heightMode
);
```

Implementation uses `NSAttributedString.boundingRect` (thread-safe) to measure text with the attributed string built from the element's text children.

## Known CSS Differences

| CSS Behavior | Yoga Behavior | Impact |
|-------------|--------------|--------|
| `display: block` | `display: flex; flex-direction: column` | Equivalent for most layouts |
| `display: inline` | Not supported | Virtual text nodes used instead |
| Margin collapsing | Not supported | Adjacent margins stack rather than collapse |
| `position: static` | `position: relative` | Functionally equivalent (no offset = same as static) |
| `em`/`rem` units | Not supported | Convert to `px` at resolution time |
| `flexShrink: 1` (CSS default) | `flexShrink: 0` for block elements | Matches block layout behavior |
