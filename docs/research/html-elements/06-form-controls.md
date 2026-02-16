# Form Controls

Interactive form elements. Each maps to a specific UIKit control or custom view.

## input — P0 (implemented)

```json
{
  "element": "input",
  "category": "FormControl",
  "priority": "P0",
  "nativeView": "UITextField",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "height": 32,
    "paddingLeft": 4,
    "paddingRight": 4,
    "borderWidth": 1,
    "borderColor": "#767676",
    "borderRadius": 2
  },
  "textDefaults": {
    "fontSize": 13.28
  },
  "visualDefaults": {
    "backgroundColor": "#FFFFFF"
  },
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
    "isAccessibilityElement": true
  },
  "supportedProps": ["type", "value", "defaultValue", "placeholder", "disabled", "readOnly", "maxLength", "autoCapitalize", "autoCorrect", "autoFocus"],
  "supportedEvents": ["onChange", "onFocus", "onBlur", "onSubmit"],
  "browserCSS": "display: inline-block; appearance: auto; letter-spacing: initial; word-spacing: initial; line-height: initial; text-transform: initial; text-indent: initial; text-shadow: initial; text-align: initial;",
  "notes": "Single-line text input. type prop controls behavior: 'text' (default), 'password' → secureTextEntry, 'email' → keyboardType .emailAddress, 'number' → keyboardType .numberPad, 'tel' → keyboardType .phonePad, 'url' → keyboardType .URL. font-size 13.28px = browser default for form controls (0.83em)."
}
```

### input[type=checkbox] — P2

```json
{
  "element": "input[type=checkbox]",
  "category": "FormControl",
  "priority": "P2",
  "nativeView": "UISwitch",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "width": 51,
    "height": 31
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
    "role": "checkbox",
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": ["checked", "defaultChecked", "disabled"],
  "supportedEvents": ["onChange"],
  "browserCSS": "appearance: auto; box-sizing: border-box;",
  "notes": "Checkbox. Map to UISwitch on iOS (native toggle). Width/height are UISwitch default intrinsic size. Alternative: custom checkbox view with checkmark image."
}
```

### input[type=radio] — P2

```json
{
  "element": "input[type=radio]",
  "category": "FormControl",
  "priority": "P2",
  "nativeView": "UIView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "width": 20,
    "height": 20,
    "borderRadius": 10,
    "borderWidth": 2,
    "borderColor": "#767676"
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
    "role": "radio",
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": ["checked", "defaultChecked", "disabled", "name"],
  "supportedEvents": ["onChange"],
  "browserCSS": "appearance: auto; box-sizing: border-box;",
  "notes": "Radio button. Custom circular view with filled center when selected. name prop groups radios (only one selected per group). Needs custom implementation — no native UIKit radio button."
}
```

### input[type=range] — P2

```json
{
  "element": "input[type=range]",
  "category": "FormControl",
  "priority": "P2",
  "nativeView": "UISlider",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "height": 31
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
    "role": "slider",
    "trait": ".adjustable",
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "min", "max", "step", "disabled"],
  "supportedEvents": ["onChange", "onInput"],
  "browserCSS": "appearance: auto;",
  "notes": "Range slider. Maps to UISlider. min/max/step control range behavior."
}
```

### input[type=color] — P3

```json
{
  "element": "input[type=color]",
  "category": "FormControl",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "width": 44,
    "height": 32,
    "borderWidth": 1,
    "borderColor": "#767676",
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
    "canHaveChildren": false,
    "isLeafNode": true
  },
  "accessibility": {
    "role": null,
    "trait": ".button",
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "disabled"],
  "supportedEvents": ["onChange"],
  "browserCSS": "appearance: auto; box-sizing: border-box;",
  "notes": "Color picker. Show a swatch of the current color. On tap, present UIColorPickerViewController."
}
```

### input[type=date] — P3

```json
{
  "element": "input[type=date]",
  "category": "FormControl",
  "priority": "P3",
  "nativeView": "UIView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "height": 32,
    "paddingLeft": 4,
    "paddingRight": 4,
    "borderWidth": 1,
    "borderColor": "#767676",
    "borderRadius": 2
  },
  "textDefaults": {
    "fontSize": 13.28
  },
  "visualDefaults": {
    "backgroundColor": "#FFFFFF"
  },
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
    "trait": ".button",
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "min", "max", "disabled"],
  "supportedEvents": ["onChange"],
  "browserCSS": "appearance: auto;",
  "notes": "Date picker. Display formatted date string. On tap, present UIDatePicker in .date mode. Also covers datetime-local (UIDatePicker .dateAndTime), time (UIDatePicker .time), month, week."
}
```

### input[type=hidden] — SKIP

```json
{
  "element": "input[type=hidden]",
  "category": "FormControl",
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
  "supportedProps": ["value", "name"],
  "supportedEvents": [],
  "browserCSS": "display: none !important;",
  "notes": "Hidden input. No visual rendering. Used for form data only — skip rendering entirely."
}
```

## textarea — P0 (implemented)

```json
{
  "element": "textarea",
  "category": "FormControl",
  "priority": "P0",
  "nativeView": "UITextView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "minHeight": 48,
    "paddingTop": 4,
    "paddingBottom": 4,
    "paddingLeft": 4,
    "paddingRight": 4,
    "borderWidth": 1,
    "borderColor": "#767676",
    "borderRadius": 2
  },
  "textDefaults": {
    "fontSize": 13.28
  },
  "visualDefaults": {
    "backgroundColor": "#FFFFFF"
  },
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
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "defaultValue", "placeholder", "rows", "disabled", "readOnly", "maxLength", "autoFocus"],
  "supportedEvents": ["onChange", "onFocus", "onBlur"],
  "browserCSS": "display: inline-block; appearance: auto; white-space: pre-wrap;",
  "notes": "Multi-line text input. rows prop determines initial height (rows * lineHeight). white-space: pre-wrap preserves whitespace and wraps."
}
```

## select — P1

```json
{
  "element": "select",
  "category": "FormControl",
  "priority": "P1",
  "nativeView": "UIView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "flexDirection": "row",
    "alignItems": "center",
    "height": 32,
    "paddingLeft": 4,
    "paddingRight": 4,
    "borderWidth": 1,
    "borderColor": "#767676",
    "borderRadius": 2
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
    "role": null,
    "trait": ".adjustable",
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "disabled", "multiple"],
  "supportedEvents": ["onChange"],
  "browserCSS": "display: inline-block; appearance: auto; text-transform: initial; text-indent: initial; text-shadow: initial; text-align: initial;",
  "notes": "Dropdown selector. On tap, present UIAlertController with action sheet style or UIMenu (iOS 14+). Children are <option> elements providing the choices. Display selected option's label as text content."
}
```

## option — P1

```json
{
  "element": "option",
  "category": "FormControl",
  "priority": "P1",
  "nativeView": "None",
  "browserDisplay": "block",
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
  "supportedProps": ["value", "disabled", "selected", "label"],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Option within select. No visual rendering of its own — data is consumed by parent <select> to build the picker. value prop is the machine value, text content or label prop is the display label."
}
```

## optgroup — P3

```json
{
  "element": "optgroup",
  "category": "FormControl",
  "priority": "P3",
  "nativeView": "None",
  "browserDisplay": "block",
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
  "supportedProps": ["label", "disabled"],
  "supportedEvents": [],
  "browserCSS": "display: block;",
  "notes": "Groups options within a select. label prop becomes section header in picker. No visual rendering of its own."
}
```

## button — P0 (implemented)

```json
{
  "element": "button",
  "category": "FormControl",
  "priority": "P0",
  "nativeView": "UIButton",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "flexDirection": "row",
    "alignItems": "center",
    "justifyContent": "center",
    "paddingTop": 4,
    "paddingBottom": 4,
    "paddingLeft": 12,
    "paddingRight": 12,
    "borderRadius": 4,
    "borderWidth": 1,
    "borderColor": "#767676"
  },
  "textDefaults": {
    "fontSize": 13.28
  },
  "visualDefaults": {
    "backgroundColor": "#EFEFEF"
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
    "role": "button",
    "trait": ".button",
    "isAccessibilityElement": true
  },
  "supportedProps": ["disabled", "type"],
  "supportedEvents": ["onClick"],
  "browserCSS": "display: inline-block; text-align: center; appearance: auto;",
  "notes": "Interactive button. Centered text. Visual dimming when disabled. Press highlight state. type prop is semantic only (no native form submission)."
}
```

## label — P1

```json
{
  "element": "label",
  "category": "FormControl",
  "priority": "P1",
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
    "isAccessibilityElement": false
  },
  "supportedProps": ["htmlFor"],
  "supportedEvents": ["onClick"],
  "browserCSS": "display: inline; cursor: default;",
  "notes": "Form label. Tapping label focuses associated input (via htmlFor prop). When inside text context, virtual. Otherwise, UIView with flexDirection row. Acts as text container for inline children."
}
```

## output — P3

```json
{
  "element": "output",
  "category": "FormControl",
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
    "isTextContainer": true,
    "breaksTextContext": false
  },
  "tree": {
    "canHaveChildren": true,
    "isLeafNode": false
  },
  "accessibility": {
    "role": "status",
    "trait": ".updatesFrequently",
    "isAccessibilityElement": true
  },
  "supportedProps": ["htmlFor"],
  "supportedEvents": [],
  "browserCSS": "display: inline;",
  "notes": "Calculation result. Inline element, same as span visually. Accessibility role: status (announces changes to screen readers)."
}
```

## progress — P2

```json
{
  "element": "progress",
  "category": "FormControl",
  "priority": "P2",
  "nativeView": "UIProgressView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "height": 4
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
    "role": "progressbar",
    "trait": ".updatesFrequently",
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "max"],
  "supportedEvents": [],
  "browserCSS": "display: inline-block; appearance: auto;",
  "notes": "Progress bar. Maps to UIProgressView. progress = value / max (both default to 0/1). Indeterminate when no value prop (animated bar). Height 4px matches UIProgressView default."
}
```

## meter — P3

```json
{
  "element": "meter",
  "category": "FormControl",
  "priority": "P3",
  "nativeView": "UIProgressView",
  "browserDisplay": "inline-block",
  "yogaDefaults": {
    "height": 4
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
    "role": "meter",
    "trait": null,
    "isAccessibilityElement": true
  },
  "supportedProps": ["value", "min", "max", "low", "high", "optimum"],
  "supportedEvents": [],
  "browserCSS": "display: inline-block; appearance: auto;",
  "notes": "Scalar gauge (disk usage, relevance). Similar to progress but has low/high/optimum thresholds that change color (green/yellow/red). Map to UIProgressView with tintColor based on thresholds."
}
```

## datalist — SKIP

```json
{
  "element": "datalist",
  "category": "FormControl",
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
  "notes": "Autocomplete suggestions for input. Hidden element. Provides list of <option> children to an associated <input> via list attribute. Would need custom autocomplete UI. Skip for now."
}
```
