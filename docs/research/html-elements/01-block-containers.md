# Block Containers

Block-level elements that create visual containers. All map to `UIView` with `flexDirection: column`.

## div — P0 (implemented)

```json
{
  "element": "div",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Universal container. Promotes to UIScrollView when overflow is scroll/auto."
}
```

## main — P0 (implemented)

```json
{
  "element": "main",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "main",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with accessibility landmark role."
}
```

## section — P0 (implemented)

```json
{
  "element": "section",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "region",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with accessibility landmark role."
}
```

## article — P0 (implemented)

```json
{
  "element": "article",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "article",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with accessibility landmark role."
}
```

## nav — P0 (implemented)

```json
{
  "element": "nav",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "navigation",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with navigation landmark role."
}
```

## header — P0 (implemented)

```json
{
  "element": "header",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "banner",
    "trait": ".header",
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with banner landmark role."
}
```

## footer — P0 (implemented)

```json
{
  "element": "footer",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "contentinfo",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with contentinfo landmark role."
}
```

## aside — P0 (implemented)

```json
{
  "element": "aside",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "complementary",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with complementary landmark role."
}
```

## form — P0 (implemented)

```json
{
  "element": "form",
  "category": "BlockContainer",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "form",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": ["onSubmit"],
  "browserCSS": "display: block;",
  "notes": "Same as div. No native form submission — handle via onSubmit callback."
}
```

## address — P1

```json
{
  "element": "address",
  "category": "BlockContainer",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column"
  },
  "textDefaults": {
    "fontStyle": "italic"
  },
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
  "browserCSS": "display: block; font-style: italic;",
  "notes": "Block container with italic text default. Used for contact information."
}
```

## search — P2

```json
{
  "element": "search",
  "category": "BlockContainer",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "search",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Same as div with search landmark role. Newer HTML element."
}
```

## figure — P1

```json
{
  "element": "figure",
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
    "role": "figure",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em; margin-inline: 40px;",
  "notes": "Self-contained content (images, diagrams). Same margins as blockquote."
}
```

## figcaption — P1

```json
{
  "element": "figcaption",
  "category": "BlockContainer",
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
  "browserCSS": "display: block;",
  "notes": "Caption for a figure element. No special defaults beyond block display."
}
```

## blockquote — P1

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
    "role": "blockquote",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["cite"],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-block: 1em; margin-inline: 40px;",
  "notes": "Indented block quotation. 40px left+right margin matches browser default."
}
```

## pre — P1

```json
{
  "element": "pre",
  "category": "BlockContainer",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "marginTop": 16,
    "marginBottom": 16
  },
  "textDefaults": {
    "fontFamily": "Menlo",
    "whiteSpace": "pre"
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
    "role": null,
    "trait": ".staticText",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; font-family: monospace; white-space: pre; margin-block: 1em;",
  "notes": "Preformatted text. Must preserve whitespace and newlines. Uses monospace font (Menlo on iOS). Acts as text container for inline children."
}
```

## details — P2

```json
{
  "element": "details",
  "category": "BlockContainer",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["open"],
  "supportedEvents": ["onToggle"],
  "browserCSS": "display: block;",
  "notes": "Disclosure widget. Children hidden unless open prop is true. First <summary> child acts as the toggle button. Non-summary children hidden when closed."
}
```

## summary — P2

```json
{
  "element": "summary",
  "category": "BlockContainer",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "button",
    "trait": ".button",
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": ["onClick"],
  "browserCSS": "display: block;",
  "notes": "Toggle button for <details>. Renders a disclosure triangle marker (▶/▼) prepended to content. Use flexDirection row for marker + content layout."
}
```

## dialog — P2

```json
{
  "element": "dialog",
  "category": "BlockContainer",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "none",
  "yogaDefaults": {
    "flexDirection": "column",
    "paddingTop": 16,
    "paddingBottom": 16,
    "paddingLeft": 16,
    "paddingRight": 16,
    "borderWidth": 1,
    "borderColor": "#000000"
  },
  "textDefaults": {},
  "visualDefaults": {
    "backgroundColor": "#FFFFFF"
  },
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
    "role": "dialog",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["open"],
  "supportedEvents": ["onClose"],
  "browserCSS": "display: none; position: absolute; width: fit-content; height: fit-content; margin: auto; border: solid; padding: 1em; background-color: Canvas; color: CanvasText;",
  "notes": "Hidden by default (display: none). When open prop is set, displayed as centered overlay. Modal variant uses position: fixed. Needs backdrop support for modal mode."
}
```

## fieldset — P2

```json
{
  "element": "fieldset",
  "category": "BlockContainer",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "marginLeft": 2,
    "marginRight": 2,
    "paddingTop": 5.6,
    "paddingBottom": 10,
    "paddingLeft": 12,
    "paddingRight": 12,
    "borderWidth": 2,
    "borderColor": "#C0C0C0",
    "borderRadius": 4
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
    "role": "group",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["disabled"],
  "supportedEvents": [],
  "browserCSS": "display: block; margin-inline: 2px; border: groove 2px ThreeDFace; padding-block: 0.35em 0.625em; padding-inline: 0.75em; min-inline-size: min-content;",
  "notes": "Groups form controls. Browser uses groove border style — approximate with solid border + muted color. The disabled prop disables all descendant form controls."
}
```

## legend — P2

```json
{
  "element": "legend",
  "category": "BlockContainer",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "row",
    "paddingLeft": 2,
    "paddingRight": 2
  },
  "textDefaults": {},
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; padding-inline: 2px;",
  "notes": "Caption for fieldset. In browsers, renders overlapping the fieldset border. Simplify to just a label at the top of the fieldset."
}
```

## hgroup — P3

```json
{
  "element": "hgroup",
  "category": "BlockContainer",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "block",
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
    "role": "group",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Groups a heading with related content (subtitles). Same as div visually."
}
```

## center — P3 (obsolete)

```json
{
  "element": "center",
  "category": "BlockContainer",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "flexDirection": "column",
    "alignItems": "center"
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
  "browserCSS": "display: block; text-align: center;",
  "notes": "Obsolete. Equivalent to div with alignItems: center. Included for legacy content compatibility."
}
```
