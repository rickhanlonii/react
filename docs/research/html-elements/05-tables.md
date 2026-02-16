# Tables

Table elements. Browser uses `display: table/table-row/table-cell` which has no Yoga equivalent. We approximate with nested flex containers.

## Translation Strategy

```
<table>     → UIView, flexDirection: column (holds rows)
<caption>   → UIView, flexDirection: column (above table body)
<thead>     → UIView, flexDirection: column (group of rows)
<tbody>     → UIView, flexDirection: column (group of rows)
<tfoot>     → UIView, flexDirection: column (group of rows)
<tr>        → UIView, flexDirection: row (holds cells)
<td>/<th>   → UIView, flex: 1 (equal-width cells by default)
<colgroup>  → SKIP (no visual rendering)
<col>       → SKIP (no visual rendering)
```

This approximation gives equal-width columns. True table layout (auto-sizing columns to content) would require a custom layout pass, which is out of scope for now.

## table — P1

```json
{
  "element": "table",
  "category": "Table",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "table",
  "yogaDefaults": {
    "flexDirection": "column"
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
    "role": "table",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["border"],
  "supportedEvents": [],
  "browserCSS": "display: table; border-spacing: 2px; border-collapse: separate; text-indent: initial; box-sizing: border-box;",
  "notes": "Table container. Browser uses table layout algorithm — we approximate with flex column. border-spacing translates to gap: 2 on rows. When border attribute present, adds 1px border to cells."
}
```

## caption — P2

```json
{
  "element": "caption",
  "category": "Table",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "table-caption",
  "yogaDefaults": {
    "flexDirection": "column",
    "alignItems": "center"
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: table-caption; text-align: center;",
  "notes": "Table caption. Rendered above the table body. Centered text by default."
}
```

## colgroup — SKIP

```json
{
  "element": "colgroup",
  "category": "Table",
  "priority": "SKIP",
  "nativeView": "None",
  "browserDisplay": "table-column-group",
  "yogaDefaults": {},
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
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
  "supportedProps": ["span"],
  "supportedEvents": [],
  "browserCSS": "display: table-column-group;",
  "notes": "Column group. Used for styling columns. No visual rendering — skip entirely. Column width would need custom table layout algorithm."
}
```

## col — SKIP

```json
{
  "element": "col",
  "category": "Table",
  "priority": "SKIP",
  "nativeView": "None",
  "browserDisplay": "table-column",
  "yogaDefaults": {},
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
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
  "supportedProps": ["span"],
  "supportedEvents": [],
  "browserCSS": "display: table-column;",
  "notes": "Column definition. No visual rendering — skip entirely."
}
```

## thead — P1

```json
{
  "element": "thead",
  "category": "Table",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "table-header-group",
  "yogaDefaults": {
    "flexDirection": "column"
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
    "role": "rowgroup",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: table-header-group; vertical-align: middle;",
  "notes": "Table header group. Contains header rows. Visually just a container."
}
```

## tbody — P1

```json
{
  "element": "tbody",
  "category": "Table",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "table-row-group",
  "yogaDefaults": {
    "flexDirection": "column"
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
    "role": "rowgroup",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: table-row-group; vertical-align: middle;",
  "notes": "Table body group. Contains body rows. Visually just a container."
}
```

## tfoot — P2

```json
{
  "element": "tfoot",
  "category": "Table",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "table-footer-group",
  "yogaDefaults": {
    "flexDirection": "column"
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
    "role": "rowgroup",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: table-footer-group; vertical-align: middle;",
  "notes": "Table footer group. Contains footer rows. Visually just a container."
}
```

## tr — P1

```json
{
  "element": "tr",
  "category": "Table",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "table-row",
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
    "role": "row",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: table-row; vertical-align: inherit;",
  "notes": "Table row. flexDirection row so cells line up horizontally."
}
```

## th — P1

```json
{
  "element": "th",
  "category": "Table",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "table-cell",
  "yogaDefaults": {
    "flex": 1,
    "paddingTop": 1,
    "paddingBottom": 1,
    "paddingLeft": 1,
    "paddingRight": 1,
    "flexDirection": "column",
    "justifyContent": "center"
  },
  "textDefaults": {
    "fontWeight": "bold",
    "textAlign": "center"
  },
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
    "role": "columnheader",
    "trait": ".header",
    "isAccessibilityElement": true
  },
  "supportedProps": ["colspan", "rowspan", "scope"],
  "supportedEvents": [],
  "browserCSS": "display: table-cell; vertical-align: inherit; padding: 1px; font-weight: bold;",
  "notes": "Table header cell. Bold text, centered. flex: 1 for equal-width columns. colspan/rowspan would need custom handling — not supported in flex approximation."
}
```

## td — P1

```json
{
  "element": "td",
  "category": "Table",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "table-cell",
  "yogaDefaults": {
    "flex": 1,
    "paddingTop": 1,
    "paddingBottom": 1,
    "paddingLeft": 1,
    "paddingRight": 1,
    "flexDirection": "column",
    "justifyContent": "center"
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
    "role": "cell",
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": ["colspan", "rowspan"],
  "supportedEvents": [],
  "browserCSS": "display: table-cell; vertical-align: inherit; padding: 1px;",
  "notes": "Table data cell. flex: 1 for equal-width columns. colspan/rowspan would need custom handling — not supported in flex approximation."
}
```
