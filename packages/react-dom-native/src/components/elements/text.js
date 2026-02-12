'use strict';

/**
 * Text Elements
 *
 * Registers text-related HTML elements:
 * p, h1-h6, span, strong, em, b, i, u, s, a, label, br
 *
 * Text containers (p, h1-h6) use TextRenderView and establish text context.
 * Virtual text nodes (span, strong, em, etc.) have no UIView when inside a
 * text container — they contribute attributed string attributes instead.
 */

const {
  registerElement,
  ElementCategory,
  ViewType,
  commonProps,
  textProps,
} = require('../registry');

// ---------------------------------------------------------------------------
// p — paragraph (text container)
// ---------------------------------------------------------------------------
registerElement('p', {
  category: ElementCategory.TextContainer,
  viewType: ViewType.TextRenderView,
  yogaDefaults: {
    marginTop: 16,
    marginBottom: 16,
  },
  textDefaults: {
    fontSize: 16,
    fontWeight: 'normal',
  },
  accessibility: {
    role: 'text',
    trait: 'staticText',
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
  },
  validProps: textProps,
  isTextContainer: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// h1-h6 — headings (text containers)
// ---------------------------------------------------------------------------

const headingDefs = [
  {type: 'h1', fontSize: 32, margin: 21.4},
  {type: 'h2', fontSize: 24, margin: 19.9},
  {type: 'h3', fontSize: 18.7, margin: 18.7},
  {type: 'h4', fontSize: 16, margin: 21.3},
  {type: 'h5', fontSize: 13.3, margin: 22.2},
  {type: 'h6', fontSize: 10.7, margin: 24.9},
];

for (const {type, fontSize, margin} of headingDefs) {
  registerElement(type, {
    category: ElementCategory.TextContainer,
    viewType: ViewType.TextRenderView,
    yogaDefaults: {
      marginTop: margin,
      marginBottom: margin,
    },
    textDefaults: {
      fontSize,
      fontWeight: 'bold',
    },
    accessibility: {
      role: 'heading',
      trait: 'header',
      isAccessibilityElement: true,
    },
    eventSupport: {
      supportsClick: true,
      supportsTouch: true,
    },
    validProps: textProps,
    isTextContainer: true,
    canHaveChildren: true,
  });
}

// ---------------------------------------------------------------------------
// span — inline text / flex container
// ---------------------------------------------------------------------------
registerElement('span', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {},
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// strong / b — bold text
// ---------------------------------------------------------------------------
registerElement('strong', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    fontWeight: 'bold',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

registerElement('b', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    fontWeight: 'bold',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// em / i — italic text
// ---------------------------------------------------------------------------
registerElement('em', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    fontStyle: 'italic',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

registerElement('i', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    fontStyle: 'italic',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// u — underline text
// ---------------------------------------------------------------------------
registerElement('u', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    textDecorationLine: 'underline',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// s — strikethrough text
// ---------------------------------------------------------------------------
registerElement('s', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    textDecorationLine: 'line-through',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: textProps,
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// a — anchor / link
// ---------------------------------------------------------------------------
registerElement('a', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  defaultStyles: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  accessibility: {
    role: 'link',
    trait: 'link',
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
  },
  validProps: [...textProps, 'href', 'target'],
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// label — form label
// ---------------------------------------------------------------------------
registerElement('label', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  fallbackViewType: ViewType.UIView,
  fallbackYogaDefaults: {
    flexDirection: 'row',
    flexShrink: 1,
  },
  textDefaults: {},
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  validProps: [...textProps, 'htmlFor'],
  canBeVirtual: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// br — line break
// ---------------------------------------------------------------------------
registerElement('br', {
  category: ElementCategory.VirtualText,
  viewType: ViewType.Virtual,
  yogaDefaults: {},
  textDefaults: {},
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  canBeVirtual: true,
  canHaveChildren: false,
  isLeafNode: true,
});
