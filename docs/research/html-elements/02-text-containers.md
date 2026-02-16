# Text Containers

Block-level elements that establish text context for their children. Inline children (`span`, `strong`, `em`, etc.) become virtual text nodes rendered as attributed string ranges.

All text containers map to `UILabel` with `numberOfLines: 0` (multiline).

## p — P0 (implemented)

```json
{
  "element": "p",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 16
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "text",
    "trait": ".staticText",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em;",
  "notes": "Browser default has margin-block 1em (16px). Currently implemented without margins to avoid double-spacing with Yoga gap. Margins should be added when margin collapsing is handled."
}
```

## h1 — P0 (implemented)

```json
{
  "element": "h1",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 32,
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "heading",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-size: 2em; font-weight: bold; margin-block: 0.67em;",
  "notes": "2em = 32px at base 16px. Browser margin-block is 0.67em = 21.4px at 32px font size. Note: browser reduces h1 font size when nested inside article/section/nav/aside (1.5em at depth 1, 1.17em at depth 2, etc.). We ignore this nesting behavior."
}
```

## h2 — P0 (implemented)

```json
{
  "element": "h2",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 24,
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "heading",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-size: 1.5em; font-weight: bold; margin-block: 0.83em;",
  "notes": "1.5em = 24px. Margin-block 0.83em = 19.9px at 24px."
}
```

## h3 — P0 (implemented)

```json
{
  "element": "h3",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 18.72,
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "heading",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-size: 1.17em; font-weight: bold; margin-block: 1em;",
  "notes": "1.17em = 18.72px. Margin-block 1em = 18.72px at 18.72px."
}
```

## h4 — P0 (implemented)

```json
{
  "element": "h4",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 16,
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "heading",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-size: 1em; font-weight: bold; margin-block: 1.33em;",
  "notes": "1em = 16px. Margin-block 1.33em = 21.28px at 16px."
}
```

## h5 — P0 (implemented)

```json
{
  "element": "h5",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 13.28,
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "heading",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-size: 0.83em; font-weight: bold; margin-block: 1.67em;",
  "notes": "0.83em = 13.28px. Margin-block 1.67em = 22.18px at 13.28px."
}
```

## h6 — P0 (implemented)

```json
{
  "element": "h6",
  "category": "TextContainer",
  "priority": "P0",
  "nativeView": "UILabel",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontSize": 10.72,
    "fontWeight": "bold"
  },
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "heading",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-size: 0.67em; font-weight: bold; margin-block: 2.33em;",
  "notes": "0.67em = 10.72px. Margin-block 2.33em = 24.98px at 10.72px."
}
```
