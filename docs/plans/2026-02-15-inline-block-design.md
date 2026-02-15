# Display: inline-block Implementation

## Date: 2026-02-15

## Summary

Add `display: inline-block` to the Yoga layout engine and set it as the default for all HTML elements that use inline-block in the browser UA stylesheet.

## CSS Behavior

An inline-block element:

1. **Shrinks to fit** content width (unlike block which stretches to fill parent)
2. **Flows horizontally** with other inline/inline-block siblings on the same line
3. **Wraps to next line** when the current line overflows
4. **Does NOT participate in margin collapsing**
5. **Creates its own formatting context** internally (children lay out normally)

## Elements

Per the HTML spec and Chrome UA stylesheet, these elements get `display: inline-block` by default:

| Element | Category | Notes |
|---------|----------|-------|
| `button` | Form control | |
| `input` | Form control | |
| `textarea` | Form control | |
| `select` | Form control | |
| `progress` | Form control | |
| `meter` | Form control | |
| `img` | Replaced | Technically `display: inline` in CSS but replaced elements behave as inline-block |
| `video` | Replaced | Same as img |
| `audio` | Replaced | Same as img |
| `canvas` | Replaced | Same as img |
| `iframe` | Replaced | Same as img |
| `embed` | Replaced | Same as img |
| `object` | Replaced | Same as img |

## Implementation

### 1. Yoga C++ enum

Add `YGDisplayInlineBlock` as the 5th value to `YGDisplay` in:
- `include/yoga/YGEnums.h`
- `yoga/enums/Display.h`
- `yoga/YGEnums.cpp`

### 2. Block layout algorithm

Modify `calculateBlockLayout` in `CalculateLayout.cpp` to handle inline-block children with line-based flow:

```
for each child in block parent:
  if child is Display::Block:
    flush any pending inline line
    lay out block child (full width stretch, margin collapsing) — existing behavior

  if child is Display::InlineBlock:
    measure child with shrink-to-fit (MaxContent width)
    if child fits on current line:
      add to current line
    else:
      flush current line (position items left-to-right, advance Y)
      start new line with this child
    no margin collapsing for inline-block children

flush any remaining inline line
```

### 3. YogaStyleApplier.swift

Add `"inline-block"` case to the display switch statement, mapping to the new `YGDisplayInlineBlock` enum value.

### 4. ElementDefaults.swift

Add `"display": "inline-block"` to defaults for all elements listed above. Keep existing visual defaults (padding, border, colors, etc.).

## Not in scope

- True CSS `display: inline` (text-level inline flow with line breaking mid-element)
- `vertical-align` within a line — inline-block items align to top of their line
- Baseline alignment between inline-block siblings
