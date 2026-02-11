'use strict';

/**
 * HTML Element Registry
 *
 * Maps HTML element type strings (e.g. 'div', 'span', 'p') to their native
 * view configurations: UIKit class, Yoga layout defaults, text rendering mode,
 * accessibility traits, event support, and prop mappings.
 *
 * This is the JS-side mirror of the C++ HTMLElementRegistry. It is used by
 * the renderer's `createInstance` to determine how to configure each element,
 * and in DEV mode for prop validation.
 */

// ---------------------------------------------------------------------------
// Category and ViewType constants (mirrors C++ enums)
// ---------------------------------------------------------------------------

const ElementCategory = Object.freeze({
  Container: 'Container',
  TextContainer: 'TextContainer',
  VirtualText: 'VirtualText',
  Input: 'Input',
  Select: 'Select',
  Image: 'Image',
  Button: 'Button',
  List: 'List',
  ListItem: 'ListItem',
  HorizontalRule: 'HorizontalRule',
  Video: 'Video',
});

const ViewType = Object.freeze({
  UIView: 'UIView',
  UIScrollView: 'UIScrollView',
  UIImageView: 'UIImageView',
  UITextField: 'UITextField',
  UITextView: 'UITextView',
  TextRenderView: 'TextRenderView',
  Virtual: 'Virtual',
});

// ---------------------------------------------------------------------------
// Common prop sets
// ---------------------------------------------------------------------------

const commonProps = Object.freeze([
  // Layout
  'style',
  // Identity
  'id',
  'key',
  'ref',
  // Events
  'onClick',
  'onTouchStart',
  'onTouchEnd',
  'onTouchMove',
  'onLayout',
  // Accessibility
  'aria-label',
  'aria-hidden',
  'aria-disabled',
  'aria-selected',
  'aria-checked',
  'role',
  'tabIndex',
  'className',
]);

const textProps = Object.freeze([
  'style',
  'id',
  'key',
  'ref',
  'onClick',
  'aria-label',
  'aria-hidden',
  'role',
  'className',
]);

const inputProps = Object.freeze([
  ...commonProps,
  'type',
  'value',
  'defaultValue',
  'placeholder',
  'onChange',
  'onFocus',
  'onBlur',
  'onSubmit',
  'maxLength',
  'autoCapitalize',
  'autoCorrect',
  'autoFocus',
  'disabled',
  'readOnly',
]);

// ---------------------------------------------------------------------------
// Registry storage
// ---------------------------------------------------------------------------

const registry = new Map();

// ---------------------------------------------------------------------------
// Registration API
// ---------------------------------------------------------------------------

/**
 * Registers an HTML element type with its native configuration.
 *
 * @param {string} type - The HTML element type string (e.g. 'div', 'span')
 * @param {object} config - Element configuration
 * @param {string} config.category - ElementCategory value
 * @param {string} config.viewType - ViewType value (default native view)
 * @param {object} config.yogaDefaults - Default Yoga layout properties
 * @param {object} [config.defaultStyles] - Default visual style properties
 * @param {object} [config.textDefaults] - Default text rendering properties
 * @param {object} [config.accessibility] - Accessibility configuration
 * @param {object} [config.eventSupport] - Supported event types
 * @param {string[]} [config.validProps] - Valid prop names for this element
 * @param {boolean} [config.canHaveChildren] - Whether element accepts children
 * @param {boolean} [config.isLeafNode] - Whether element is a leaf (no children)
 * @param {boolean} [config.canBeVirtual] - Can be virtual in text context
 * @param {boolean} [config.isTextContainer] - Establishes text context
 * @param {boolean} [config.breaksTextContext] - Breaks parent text context
 * @param {string} [config.fallbackViewType] - ViewType when outside text context
 * @param {object} [config.fallbackYogaDefaults] - Yoga defaults outside text context
 */
function registerElement(type, config) {
  if (typeof type !== 'string' || type.length === 0) {
    throw new Error('registerElement: type must be a non-empty string');
  }

  const descriptor = Object.freeze({
    elementType: type,
    category: config.category,
    viewType: config.viewType,
    yogaDefaults: Object.freeze(config.yogaDefaults || {}),
    defaultStyles: Object.freeze(config.defaultStyles || {}),
    textDefaults: Object.freeze(config.textDefaults || {}),
    accessibility: Object.freeze(config.accessibility || {}),
    eventSupport: Object.freeze({
      supportsClick: false,
      supportsTouch: false,
      supportsScroll: false,
      supportsChange: false,
      supportsFocus: false,
      supportsLoad: false,
      ...(config.eventSupport || {}),
    }),
    validProps: Object.freeze(config.validProps || commonProps),
    canHaveChildren: config.canHaveChildren !== false,
    isLeafNode: config.isLeafNode === true,
    canBeVirtual: config.canBeVirtual === true,
    isTextContainer: config.isTextContainer === true,
    breaksTextContext: config.breaksTextContext === true,
    fallbackViewType: config.fallbackViewType || null,
    fallbackYogaDefaults: config.fallbackYogaDefaults
      ? Object.freeze(config.fallbackYogaDefaults)
      : null,
  });

  registry.set(type, descriptor);
  return descriptor;
}

// ---------------------------------------------------------------------------
// Lookup API
// ---------------------------------------------------------------------------

/**
 * Returns the element configuration for a given HTML element type.
 *
 * @param {string} type - The HTML element type string
 * @returns {object|null} The element descriptor, or null if unknown
 */
function getElementConfig(type) {
  return registry.get(type) || null;
}

/**
 * Checks whether an element type is registered.
 *
 * @param {string} type - The HTML element type string
 * @returns {boolean}
 */
function isKnownElement(type) {
  return registry.has(type);
}

/**
 * Returns all registered element type strings.
 *
 * @returns {string[]}
 */
function getAllElementTypes() {
  return Array.from(registry.keys());
}

/**
 * Returns the resolved ViewType for an element, accounting for text context.
 *
 * Elements that can be virtual (span, strong, em, a, etc.) return Virtual
 * when inside a text context, and their fallbackViewType otherwise.
 *
 * A div with overflow: scroll or overflow: auto is promoted to UIScrollView.
 *
 * @param {string} type - The HTML element type string
 * @param {boolean} isInsideTextContext - Whether this element is in text context
 * @param {object} [props] - The element's props (for scroll promotion)
 * @returns {string} ViewType value
 */
function getResolvedViewType(type, isInsideTextContext, props) {
  const config = getElementConfig(type);
  if (!config) {
    return ViewType.UIView;
  }

  // Virtual text elements: virtual inside text context, fallback outside
  if (config.canBeVirtual && isInsideTextContext) {
    return ViewType.Virtual;
  }

  if (config.canBeVirtual && config.fallbackViewType) {
    return config.fallbackViewType;
  }

  // Scroll promotion for div-like containers
  if (config.viewType === ViewType.UIView && props && props.style) {
    const overflow = props.style.overflow;
    if (overflow === 'scroll' || overflow === 'auto') {
      return ViewType.UIScrollView;
    }
  }

  return config.viewType;
}

/**
 * Clears all registered elements. Used for testing.
 */
function clearRegistry() {
  registry.clear();
}

module.exports = {
  // Registration
  registerElement,

  // Lookup
  getElementConfig,
  isKnownElement,
  getAllElementTypes,
  getResolvedViewType,

  // Testing
  clearRegistry,

  // Constants
  ElementCategory,
  ViewType,

  // Prop sets
  commonProps,
  textProps,
  inputProps,
};
