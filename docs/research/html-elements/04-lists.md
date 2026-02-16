# Lists

List elements for ordered, unordered, and definition lists.

## ul — P0 (implemented)

```json
{
  "element": "ul",
  "category": "List",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "paddingLeft": 40
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
    "role": "list",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em; padding-inline-start: 40px; list-style-type: disc;",
  "notes": "Unordered list. Browser default has margin-block 1em (16px) — currently omitted. paddingLeft 40px matches browser. Nested ULs change bullet style: disc → circle → square. Browser also removes margin-block on nested lists."
}
```

## ol — P0 (implemented)

```json
{
  "element": "ol",
  "category": "List",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "paddingLeft": 40
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
    "role": "list",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["start", "reversed", "type"],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em; padding-inline-start: 40px; list-style-type: decimal;",
  "notes": "Ordered list. Uses decimal numbering (1, 2, 3...). start prop sets initial counter. reversed reverses counting. type prop changes style: '1' decimal, 'a' lower-alpha, 'A' upper-alpha, 'i' lower-roman, 'I' upper-roman."
}
```

## li — P0 (implemented)

```json
{
  "element": "li",
  "category": "List",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "list-item",
  "yogaDefaults": {
    "flexDirection": "row"
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
    "isAccessibilityElement": true
  },
  "supportedProps": ["value"],
  "supportedEvents": [],
  "browserCSS": "display: list-item; text-align: match-parent;",
  "notes": "List item. Uses flexDirection row to place marker (bullet/number) alongside content. Marker is a prepended virtual text node or UILabel. value prop overrides counter in ordered lists."
}
```

## dl — P1

```json
{
  "element": "dl",
  "category": "List",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "marginTop": 16,
    "marginBottom": 16
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
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em;",
  "notes": "Definition list container. Contains <dt> (terms) and <dd> (definitions)."
}
```

## dt — P1

```json
{
  "element": "dt",
  "category": "List",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": true
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "term",
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Definition term. No special styling in browser. Block display, acts as text container."
}
```

## dd — P1

```json
{
  "element": "dd",
  "category": "List",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "marginLeft": 40
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": true,
    "breaksTextContext": true
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "definition",
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-inline-start: 40px;",
  "notes": "Definition description. Indented 40px from the left (matching list indent). Acts as text container."
}
```

## menu — P3

```json
{
  "element": "menu",
  "category": "List",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "paddingLeft": 40
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
    "role": "list",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em; padding-inline-start: 40px; list-style-type: disc;",
  "notes": "Semantically a toolbar/menu but browsers render identically to <ul>. Treat as alias for <ul>."
}
```
