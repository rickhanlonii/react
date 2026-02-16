# Embedded & Media

Elements that embed external content: images, video, audio, iframes, canvas.

## img — P0 (implemented)

```json
{
  "element": "img",
  "category": "EmbeddedMedia",
  "priority": "P0",
  "nativeView": "UIImageView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "objectFit": "fill"
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
    "role": "image",
    "trait": ".image",
    "isAccessibilityElement": true
  },
  "supportedProps": ["src", "alt", "width", "height", "loading"],
  "supportedEvents": ["onLoad", "onError"],
  "browserCSS": "/* replaced element, inline display */",
  "notes": "Image. Replaced element with intrinsic size from loaded image. objectFit maps to UIImageView.contentMode: 'fill' → .scaleToFill, 'cover' → .scaleAspectFill, 'contain' → .scaleAspectFit, 'none' → .center. alt becomes accessibilityLabel. loading='lazy' defers load."
}
```

## picture — P2

```json
{
  "element": "picture",
  "category": "EmbeddedMedia",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "inline",
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
  "browserCSS": "/* no special styling */",
  "notes": "Container for responsive image sources. Contains <source> elements and a fallback <img>. In native, just render the <img> child — we don't have media queries. Could support <source> with media-based selection later."
}
```

## source — SKIP

```json
{
  "element": "source",
  "category": "EmbeddedMedia",
  "priority": "SKIP",
  "nativeView": "None",
  "browserDisplay": "none",
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
  "supportedProps": ["src", "type", "media", "srcset", "sizes"],
  "supportedEvents": [],
  "browserCSS": "/* no rendering */",
  "notes": "Media source for picture/video/audio. No visual rendering. Data consumed by parent element. Skip rendering — parent handles source selection."
}
```

## video — P2

```json
{
  "element": "video",
  "category": "EmbeddedMedia",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "width": 300,
    "height": 150
  },
  "textDefaults": {},
  "visualDefaults": {
    "backgroundColor": "#000000"
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": ["src", "poster", "autoplay", "controls", "loop", "muted", "preload", "width", "height"],
  "supportedEvents": ["onPlay", "onPause", "onEnded", "onError", "onTimeUpdate", "onLoadedData"],
  "browserCSS": "object-fit: contain;",
  "notes": "Video player. Use AVPlayerLayer in a UIView. Default size 300x150 matches browser replaced element default. controls prop shows/hides playback controls. poster prop shows image before playback starts. objectFit: contain is browser default."
}
```

## audio — P2

```json
{
  "element": "audio",
  "category": "EmbeddedMedia",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "none",
  "yogaDefaults": {
    "flexDirection": "row",
    "alignItems": "center",
    "height": 32
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
  "supportedProps": ["src", "autoplay", "controls", "loop", "muted", "preload"],
  "supportedEvents": ["onPlay", "onPause", "onEnded", "onError", "onTimeUpdate"],
  "browserCSS": "/* display: none when no controls attribute */",
  "notes": "Audio player. Hidden by default (display: none). When controls prop is set, render a minimal playback control bar (play/pause button, time slider, duration). Use AVAudioPlayer or AVPlayer for playback."
}
```

## canvas — P3

```json
{
  "element": "canvas",
  "category": "EmbeddedMedia",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "width": 300,
    "height": 150
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["width", "height"],
  "supportedEvents": [],
  "browserCSS": "/* replaced element, 300x150 default */",
  "notes": "Programmable graphics surface. Would need Canvas API bridge (getContext('2d') etc.) which is substantial work. Default 300x150 matches browser. Consider using Core Graphics for the backing surface. Low priority — most React apps use SVG or CSS instead."
}
```

## iframe — P3

```json
{
  "element": "iframe",
  "category": "EmbeddedMedia",
  "priority": "P3",
  "nativeView": "WKWebView",
  "browserDisplay": "inline",
  "yogaDefaults": {
    "width": 300,
    "height": 150,
    "borderWidth": 2,
    "borderColor": "#808080"
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["src", "title", "width", "height", "sandbox"],
  "supportedEvents": ["onLoad", "onError"],
  "browserCSS": "border: 2px inset;",
  "notes": "Embedded web content. Map to WKWebView. Default 300x150 with 2px border matches browser. Security: sandbox prop controls permissions. title prop becomes accessibilityLabel."
}
```

## embed — P3

```json
{
  "element": "embed",
  "category": "EmbeddedMedia",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {},
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
    "role": null,
    "trait": null,
    "isAccessibilityElement": false
  },
  "supportedProps": ["src", "type", "width", "height"],
  "supportedEvents": [],
  "browserCSS": "/* no default styling */",
  "notes": "External content embed (plugins, PDFs). Largely obsolete — use iframe or video/audio instead. Low priority."
}
```

## object — P3

```json
{
  "element": "object",
  "category": "EmbeddedMedia",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "inline",
  "yogaDefaults": {},
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
  "supportedProps": ["data", "type", "width", "height"],
  "supportedEvents": [],
  "browserCSS": "/* no default styling */",
  "notes": "External resource embed. Largely obsolete. Children are fallback content. Low priority."
}
```
