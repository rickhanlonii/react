# HTML Element Registry — Full Spec

Machine-readable descriptors for every HTML element, organized by category.
Each element has a JSON descriptor that maps directly to `ElementDefaults.swift` entries.

## Files

| File | Category | Elements |
|------|----------|----------|
| [01-block-containers.md](./01-block-containers.md) | Block Containers | div, main, section, article, nav, header, footer, aside, address, search, figure, figcaption, blockquote, pre, center, details, summary, dialog, fieldset, legend, form, hgroup |
| [02-text-containers.md](./02-text-containers.md) | Text Containers | p, h1-h6 |
| [03-inline-text.md](./03-inline-text.md) | Inline / Virtual Text | span, strong, b, em, i, u, s, del, ins, mark, small, sub, sup, abbr, cite, q, dfn, var, samp, kbd, code, time, data, a, br, wbr, ruby, rt, rp, bdi, bdo |
| [04-lists.md](./04-lists.md) | Lists | ul, ol, li, dl, dt, dd, menu |
| [05-tables.md](./05-tables.md) | Tables | table, caption, colgroup, col, thead, tbody, tfoot, tr, th, td |
| [06-form-controls.md](./06-form-controls.md) | Form Controls | input, textarea, select, option, optgroup, button, label, output, progress, meter, datalist |
| [07-embedded-media.md](./07-embedded-media.md) | Embedded & Media | img, picture, source, video, audio, canvas, iframe, embed, object |
| [08-formatting.md](./08-formatting.md) | Formatting | hr |
| [09-metadata-ignored.md](./09-metadata-ignored.md) | Metadata / Ignored | head, title, meta, link, style, script, noscript, template, slot, base |

## Priority Tiers

- **P0** — Already implemented. No new work needed.
- **P1** — Common in web apps. Implement next.
- **P2** — Less common but still used. Implement after P1.
- **P3** — Rare or niche. Implement last or skip.
- **SKIP** — No rendering; metadata or obsolete elements.

## Descriptor Format

```json
{
  "element": "blockquote",
  "category": "BlockContainer",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "marginTop": 16,
    "marginBottom": 16,
    "marginLeft": 40,
    "marginRight": 40
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": false,
    "breaksTextContext": true
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": ["onClick"],
  "browserCSS": "display: block; margin-block: 1em; margin-inline: 40px;",
  "notes": ""
}
```

### Field Reference

| Field | Description |
|-------|-------------|
| `element` | HTML tag name |
| `category` | One of: BlockContainer, TextContainer, InlineText, List, Table, FormControl, EmbeddedMedia, Formatting, Metadata |
| `priority` | P0 (done), P1 (next), P2 (later), P3 (rare), SKIP |
| `nativeView` | UIKit class: UIView, UIScrollView, UILabel, UIImageView, UITextField, UITextView, Virtual, None |
| `browserDisplay` | CSS `display` value from browser UA stylesheet |
| `yogaDefaults` | Yoga layout properties applied at element creation |
| `textDefaults` | Font/text properties applied at element creation |
| `visualDefaults` | Background, border, color properties applied at element creation |
| `textContext.canBeVirtual` | Can become a virtual node (no UIView) inside text context |
| `textContext.isTextContainer` | Establishes text context for children |
| `textContext.breaksTextContext` | Breaks parent's text context |
| `tree.canHaveChildren` | Whether the element accepts child nodes |
| `tree.isLeafNode` | Whether the element is a leaf (no children rendered) |
| `accessibility` | iOS accessibility role/trait mapping |
| `supportedProps` | Element-specific props beyond common set |
| `supportedEvents` | Element-specific events beyond common set |
| `browserCSS` | Exact CSS from WHATWG spec UA stylesheet |
| `notes` | Implementation notes |

### Common Props (all elements)

These are inherited by every element and not repeated in individual descriptors:

**Yoga layout:** `flexDirection`, `alignItems`, `justifyContent`, `alignSelf`, `flex`, `flexGrow`, `flexShrink`, `flexBasis`, `flexWrap`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `margin*`, `padding*`, `position`, `top`, `right`, `bottom`, `left`, `gap`, `rowGap`, `columnGap`, `overflow`, `aspectRatio`, `display`

**Visual:** `backgroundColor`, `opacity`, `borderRadius`, `borderWidth`, `borderColor`, `transform`, `zIndex`

**Events:** `onClick`, `onLayout`

**Other:** `id`, `style`, `className`

### Common Text Props (text containers & inline text)

These apply to elements that render or modify text:

`color`, `fontSize`, `fontWeight`, `fontStyle`, `fontFamily`, `textDecorationLine`, `textTransform`, `textAlign`, `lineHeight`, `letterSpacing`

## CSS-to-Yoga Translation Notes

| Browser CSS | Yoga/Native Equivalent |
|------------|----------------------|
| `display: block` | `flexDirection: "column"` |
| `display: inline` | Virtual node or `flexDirection: "row"` |
| `display: table` | `flexDirection: "column"` (simplified) |
| `display: table-row` | `flexDirection: "row"` |
| `display: table-cell` | flex child |
| `display: list-item` | `flexDirection: "row"` (marker + content) |
| `display: none` | Not rendered |
| `margin-block: Xem` | `marginTop: X*fontSize`, `marginBottom: X*fontSize` |
| `margin-inline: Xpx` | `marginLeft: Xpx`, `marginRight: Xpx` |
| `padding-inline-start: Xpx` | `paddingLeft: Xpx` (LTR) |
| `font-weight: bolder` | `fontWeight: "bold"` |
| `font-size: larger/smaller` | Relative to parent (scale factor) |
| `vertical-align: sub/super` | Not supported in Yoga; use `fontSize: "smaller"` only |
| `white-space: pre` | Preserve whitespace in text rendering |
| `font-family: monospace` | `fontFamily: "Menlo"` (iOS monospace) |
| `text-decoration: underline` | `textDecorationLine: "underline"` |
| `text-decoration: line-through` | `textDecorationLine: "line-through"` |
