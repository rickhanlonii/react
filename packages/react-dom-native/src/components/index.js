'use strict';

/**
 * @react-dom-native/components
 *
 * HTML element registry and component definitions for react-dom-native.
 *
 * This module exports the registry API and registers all supported HTML
 * element types with their native view configurations.
 *
 * Import this module to ensure all elements are registered before the
 * renderer creates instances.
 */

// Import the registry API first
const {
  registerElement,
  getElementConfig,
  isKnownElement,
  getAllElementTypes,
  getResolvedViewType,
  clearRegistry,
  ElementCategory,
  ViewType,
  commonProps,
  textProps,
  inputProps,
} = require('./registry');

// Register all elements by importing element definition modules.
// Each module calls registerElement() as a side effect.
require('./elements/layout');
require('./elements/text');
require('./elements/media');
require('./elements/input');

console.log('### HIT')
module.exports = {
  // Registration (for extensions / custom elements)
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
