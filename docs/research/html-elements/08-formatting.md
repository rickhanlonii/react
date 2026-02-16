# Formatting

Standalone formatting elements.

## hr — P0 (implemented)

```json
{
  "element": "hr",
  "category": "Formatting",
  "priority": "P0",
  "nativeView": "UIView",
  "browserDisplay": "block",
  "yogaDefaults": {
    "height": 0,
    "marginTop": 8,
    "marginBottom": 8,
    "borderTopWidth": 1,
    "borderTopColor": "#808080"
  },
  "textDefaults": {},
  "visualDefaults": {},
  "textContext": {
    "canBeVirtual": false,
    "isTextContainer": false,
    "breaksTextContext": true
  },
  "tree": {
    "canHaveChildren": false,
    "isLeafNode": true
  },
  "accessibility": {
    "role": "separator",
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": [],
  "supportedEvents": [],
  "browserCSS": "display: block; color: gray; border-style: inset; border-width: 1px; margin-block: 0.5em; margin-inline: auto; overflow: hidden;",
  "notes": "Horizontal rule / thematic break. Browser uses inset border style — we approximate with solid 1px top border in gray. margin 0.5em = 8px at base 16px."
}
```
