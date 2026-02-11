'use strict';

/**
 * Input Elements
 *
 * Registers interactive/input HTML elements:
 * input, button, textarea, select
 */

const {
  registerElement,
  ElementCategory,
  ViewType,
  commonProps,
  inputProps,
} = require('../registry');

// ---------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------
registerElement('button', {
  category: ElementCategory.Button,
  viewType: ViewType.UIView,
  yogaDefaults: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 12,
    paddingRight: 12,
  },
  defaultStyles: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#767676',
    backgroundColor: '#EFEFEF',
    fontSize: 13.3,
  },
  accessibility: {
    role: 'button',
    trait: 'button',
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
    supportsFocus: true,
  },
  validProps: [...commonProps, 'disabled', 'type'],
  breaksTextContext: true,
  canHaveChildren: true,
});

// ---------------------------------------------------------------------------
// input — single-line text input
// ---------------------------------------------------------------------------
registerElement('input', {
  category: ElementCategory.Input,
  viewType: ViewType.UITextField,
  yogaDefaults: {
    height: 32,
    paddingLeft: 4,
    paddingRight: 4,
  },
  defaultStyles: {
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 2,
    fontSize: 13.3,
    backgroundColor: '#FFFFFF',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
    supportsChange: true,
    supportsFocus: true,
  },
  validProps: inputProps,
  canHaveChildren: false,
  isLeafNode: true,
  breaksTextContext: true,
});

// ---------------------------------------------------------------------------
// textarea — multi-line text input
// ---------------------------------------------------------------------------
registerElement('textarea', {
  category: ElementCategory.Input,
  viewType: ViewType.UITextView,
  yogaDefaults: {
    minHeight: 48,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 4,
    paddingRight: 4,
  },
  defaultStyles: {
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 2,
    fontSize: 13.3,
    backgroundColor: '#FFFFFF',
  },
  accessibility: {
    role: null,
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
    supportsChange: true,
    supportsFocus: true,
  },
  validProps: [...inputProps, 'rows'],
  canHaveChildren: false,
  isLeafNode: true,
  breaksTextContext: true,
});

// ---------------------------------------------------------------------------
// select — dropdown picker
// ---------------------------------------------------------------------------
registerElement('select', {
  category: ElementCategory.Select,
  viewType: ViewType.UIView,
  yogaDefaults: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingLeft: 4,
    paddingRight: 4,
  },
  defaultStyles: {
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  accessibility: {
    role: 'combobox',
    trait: 'adjustable',
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsChange: true,
    supportsFocus: true,
  },
  validProps: [...commonProps, 'value', 'onChange', 'disabled'],
  breaksTextContext: true,
  canHaveChildren: true,
});
