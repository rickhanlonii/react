# Inline / Virtual Text Elements

Inline elements that modify text appearance. When inside a text context (e.g., inside `<p>`), these become virtual nodes with no UIView — they contribute `NSAttributedString` attributes. When outside text context, they fall back to a UIView with `flexDirection: row`.

## span — P0 (implemented)

```json
{
  "element": "span",
  "category": "InlineText",
  "priority": "P0",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "display: inline;",
  "notes": "Generic inline container. Virtual when inside text context, UIView fallback outside. yogaDefaults only apply in fallback (non-virtual) mode."
}
```

## strong — P0 (implemented)

```json
{
  "element": "strong",
  "category": "InlineText",
  "priority": "P0",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-weight: bolder;",
  "notes": "Strong importance. Browser uses 'bolder' (relative), we use 'bold' (700)."
}
```

## b — P1

```json
{
  "element": "b",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-weight: bolder;",
  "notes": "Visually identical to strong. No semantic difference in native."
}
```

## em — P0 (implemented)

```json
{
  "element": "em",
  "category": "InlineText",
  "priority": "P0",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontStyle": "italic"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-style: italic;",
  "notes": "Emphasis. Italic text."
}
```

## i — P1

```json
{
  "element": "i",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontStyle": "italic"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-style: italic;",
  "notes": "Visually identical to em. No semantic difference in native."
}
```

## u — P1

```json
{
  "element": "u",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "textDecorationLine": "underline"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "text-decoration: underline;",
  "notes": "Underlined text."
}
```

## s — P1

```json
{
  "element": "s",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "textDecorationLine": "line-through"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "text-decoration: line-through;",
  "notes": "Strikethrough text. Content no longer accurate or relevant."
}
```

## del — P1

```json
{
  "element": "del",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "textDecorationLine": "line-through"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "deletion",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["cite", "datetime"],
  "supportedEvents": [],
  "browserCSS": "text-decoration: line-through;",
  "notes": "Deleted text. Visually identical to <s> but carries semantic meaning (document edit)."
}
```

## ins — P1

```json
{
  "element": "ins",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "textDecorationLine": "underline"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "insertion",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["cite", "datetime"],
  "supportedEvents": [],
  "browserCSS": "text-decoration: underline;",
  "notes": "Inserted text. Visually identical to <u> but carries semantic meaning (document edit)."
}
```

## mark — P1

```json
{
  "element": "mark",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "color": "#000000"
  },
  "visualDefaults": {
    "backgroundColor": "#FFFF00"
  },
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "background: yellow; color: black;",
  "notes": "Highlighted text. Yellow background with black text. In virtual mode, use NSAttributedString background color attribute."
}
```

## small — P1

```json
{
  "element": "small",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontSize": 13.28
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-size: smaller;",
  "notes": "Browser uses relative 'smaller' keyword. At base 16px, 'smaller' = 13.28px (0.83em). Ideally should be relative to parent font size."
}
```

## sub — P2

```json
{
  "element": "sub",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontSize": 13.28,
    "baselineOffset": -4
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "vertical-align: sub; font-size: smaller;",
  "notes": "Subscript. In virtual mode use NSAttributedString.baselineOffset (negative value). In non-virtual mode, vertical-align not supported by Yoga — approximate with margin/padding."
}
```

## sup — P2

```json
{
  "element": "sup",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontSize": 13.28,
    "baselineOffset": 6
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "vertical-align: super; font-size: smaller;",
  "notes": "Superscript. In virtual mode use NSAttributedString.baselineOffset (positive value)."
}
```

## abbr — P2

```json
{
  "element": "abbr",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedProps": ["title"],
  "supportedEvents": [],
  "browserCSS": "/* abbr[title] { text-decoration: dotted underline; } */",
  "notes": "Abbreviation. When title attribute present, browser shows dotted underline. In virtual mode, apply dotted underline text decoration. Title can be used as accessibilityHint."
}
```

## cite — P2

```json
{
  "element": "cite",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontStyle": "italic"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-style: italic;",
  "notes": "Citation reference. Italic text. Visually same as <em>/<i>."
}
```

## q — P2

```json
{
  "element": "q",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedProps": ["cite"],
  "supportedEvents": [],
  "browserCSS": "/* q::before { content: open-quote; } q::after { content: close-quote; } */",
  "notes": "Inline quotation. Browser auto-inserts quotation marks via ::before/::after pseudo-elements. In native, prepend/append quotation mark characters to the text content."
}
```

## dfn — P2

```json
{
  "element": "dfn",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontStyle": "italic"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-style: italic;",
  "notes": "Definition term. Italic text. Visually same as <em>/<i>/<cite>."
}
```

## var — P2

```json
{
  "element": "var",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontStyle": "italic"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-style: italic;",
  "notes": "Variable in math/programming. Italic text."
}
```

## code — P1

```json
{
  "element": "code",
  "category": "InlineText",
  "priority": "P1",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontFamily": "Menlo"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-family: monospace;",
  "notes": "Inline code. Monospace font. Often used inside <pre> for code blocks. iOS monospace font is Menlo."
}
```

## samp — P2

```json
{
  "element": "samp",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontFamily": "Menlo"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-family: monospace;",
  "notes": "Sample output. Monospace font. Visually same as <code>/<kbd>."
}
```

## kbd — P2

```json
{
  "element": "kbd",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "fontFamily": "Menlo"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "font-family: monospace;",
  "notes": "Keyboard input. Monospace font. Visually same as <code>/<samp>."
}
```

## time — P2

```json
{
  "element": "time",
  "category": "InlineText",
  "priority": "P2",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedProps": ["datetime"],
  "supportedEvents": [],
  "browserCSS": "/* no special styling */",
  "notes": "Machine-readable time. No visual difference from span. The datetime prop provides machine-readable value."
}
```

## data — P3

```json
{
  "element": "data",
  "category": "InlineText",
  "priority": "P3",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedProps": ["value"],
  "supportedEvents": [],
  "browserCSS": "/* no special styling */",
  "notes": "Machine-readable data. No visual difference from span."
}
```

## a — P0 (implemented)

```json
{
  "element": "a",
  "category": "InlineText",
  "priority": "P0",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {
    "color": "#0000EE",
    "textDecorationLine": "underline"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "link",
    "trait": ".link",
    "isAccessibilityElement": true
  },
  "supportedProps": ["href", "target"],
  "supportedEvents": ["onClick"],
  "browserCSS": ":link { color: #0000EE; text-decoration: underline; cursor: pointer; }",
  "notes": "Link. Browser default color is #0000EE (blue). Current implementation uses #007AFF (iOS system blue). Virtual when inside text context (tappable text region). UIView with tap handler when outside text context."
}
```

## br — P0 (implemented)

```json
{
  "element": "br",
  "category": "InlineText",
  "priority": "P0",
  "nativeView": "Virtual",
  "browserDisplay": "newline",
  "yogaDefaults": {},
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": false,
    "isLeafNode": true
  },
  "accessibility": {
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "/* display-outside: newline; */",
  "notes": "Line break. Always virtual. Inserts newline character in attributed string. No UIView."
}
```

## wbr — P3

```json
{
  "element": "wbr",
  "category": "InlineText",
  "priority": "P3",
  "nativeView": "Virtual",
  "browserDisplay": "break-opportunity",
  "yogaDefaults": {},
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": false,
    "isLeafNode": true
  },
  "accessibility": {
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "/* display-outside: break-opportunity; */",
  "notes": "Word break opportunity. Suggests where text may break. In native, insert a zero-width space (U+200B) in the attributed string."
}
```

## ruby — P3

```json
{
  "element": "ruby",
  "category": "InlineText",
  "priority": "P3",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "ruby",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "display: ruby;",
  "notes": "Ruby annotation (East Asian typography). Complex to implement natively. Treat as inline span for initial implementation. Full support would require custom text layout."
}
```

## rt — P3

```json
{
  "element": "rt",
  "category": "InlineText",
  "priority": "P3",
  "nativeView": "Virtual",
  "browserDisplay": "ruby-text",
  "yogaDefaults": {},
  "textDefaults": {
    "fontSize": 8
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "display: ruby-text;",
  "notes": "Ruby text annotation. Displayed above base text in browsers. Treat as small text for initial implementation."
}
```

## rp — SKIP

```json
{
  "element": "rp",
  "category": "InlineText",
  "priority": "SKIP",
  "nativeView": "Virtual",
  "browserDisplay": "none",
  "yogaDefaults": {},
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "display: none;",
  "notes": "Ruby parentheses fallback. Hidden by default in ruby-supporting browsers. Only shown in non-ruby browsers as fallback."
}
```

## bdi — P3

```json
{
  "element": "bdi",
  "category": "InlineText",
  "priority": "P3",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedEvents": [],
  "browserCSS": "unicode-bidi: isolate;",
  "notes": "Bidirectional isolation. Isolates text direction from surrounding content. Treat as span for initial implementation. Full RTL support is separate work."
}
```

## bdo — P3

```json
{
  "element": "bdo",
  "category": "InlineText",
  "priority": "P3",
  "nativeView": "Virtual",
  "nativeViewFallback": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "flexDirection": "row",
    "flexShrink": 1
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": true,
    "isTextContainer": false,
    "breaksTextContext": false
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
  "supportedProps": ["dir"],
  "supportedEvents": [],
  "browserCSS": "unicode-bidi: isolate-override;",
  "notes": "Bidirectional override. Forces text direction via dir attribute. Treat as span for initial implementation."
}
```
