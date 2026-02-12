'use strict';

/**
 * Layout Elements
 *
 * Registers container/layout HTML elements:
 * div, main, section, article, nav, header, footer, aside, form, ul, ol, li, hr
 *
 * All are UIView-backed with flexDirection: column by default (matching CSS
 * block behavior). Semantic elements differ only in accessibility traits.
 */

const {
  registerElement,
  ElementCategory,
  ViewType,
  commonProps,
} = require('../registry');

// ---------------------------------------------------------------------------
// div — universal block container
// ---------------------------------------------------------------------------
registerElement('div', {
  category: ElementCategory.Container,
  viewType: ViewType.UIView,
  yogaDefaults: {},
  defaultStyles: {},
  accessibility: {
    role: null,
    isAccessibilityElement: false,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
    supportsScroll: false,
  },
  breaksTextContext: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// Semantic container elements — same as div with accessibility roles
// ---------------------------------------------------------------------------

const semanticContainers = [
  {type: 'main', role: 'main'},
  {type: 'section', role: 'region'},
  {type: 'article', role: 'article'},
  {type: 'nav', role: 'navigation'},
  {type: 'header', role: 'banner'},
  {type: 'footer', role: 'contentinfo'},
  {type: 'aside', role: 'complementary'},
  {type: 'form', role: 'form'},
];

for (const {type, role} of semanticContainers) {
  registerElement(type, {
    category: ElementCategory.Container,
    viewType: ViewType.UIView,
    yogaDefaults: {},
    defaultStyles: {},
    accessibility: {
      role,
      isAccessibilityElement: false,
    },
    eventSupport: {
      supportsClick: true,
      supportsTouch: true,
    },
    breaksTextContext: true,
    canHaveChildren: true,
  });
}

// ---------------------------------------------------------------------------
// ul — unordered list
// ---------------------------------------------------------------------------
registerElement('ul', {
  category: ElementCategory.List,
  viewType: ViewType.UIView,
  yogaDefaults: {
    paddingLeft: 40,
    marginTop: 16,
    marginBottom: 16,
  },
  defaultStyles: {},
  accessibility: {
    role: 'list',
    isAccessibilityElement: false,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
  },
  validProps: [...commonProps, 'start'],
  breaksTextContext: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// ol — ordered list
// ---------------------------------------------------------------------------
registerElement('ol', {
  category: ElementCategory.List,
  viewType: ViewType.UIView,
  yogaDefaults: {
    paddingLeft: 40,
    marginTop: 16,
    marginBottom: 16,
  },
  defaultStyles: {},
  accessibility: {
    role: 'list',
    isAccessibilityElement: false,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
  },
  validProps: [...commonProps, 'start', 'type'],
  breaksTextContext: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// li — list item
// ---------------------------------------------------------------------------
registerElement('li', {
  category: ElementCategory.ListItem,
  viewType: ViewType.UIView,
  yogaDefaults: {
    flexDirection: 'row',
  },
  defaultStyles: {},
  accessibility: {
    role: null,
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
  },
  validProps: [...commonProps, 'value'],
  breaksTextContext: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// hr — horizontal rule
// ---------------------------------------------------------------------------
registerElement('hr', {
  category: ElementCategory.HorizontalRule,
  viewType: ViewType.UIView,
  yogaDefaults: {
    height: 0,
    marginTop: 8,
    marginBottom: 8,
  },
  defaultStyles: {
    borderTopWidth: 1,
    borderTopColor: '#808080',
  },
  accessibility: {
    role: 'separator',
    isAccessibilityElement: false,
  },
  canHaveChildren: false,
  isLeafNode: true,
  breaksTextContext: true,
});
