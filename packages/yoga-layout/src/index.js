'use strict';

const {
  FlexDirection,
  Justify,
  Align,
  PositionType,
  Wrap,
  Overflow,
  Display,
  Direction,
  Edge,
  Gutter,
  NodeType,
  BoxSizing,
} = require('./YogaConstants');

const {
  ELEMENT_DEFAULTS,
  getDefaultsForElement,
  BLOCK_DEFAULTS,
  SPAN_DEFAULTS,
  P_DEFAULTS,
  H1_DEFAULTS,
  H2_DEFAULTS,
  H3_DEFAULTS,
  H4_DEFAULTS,
  H5_DEFAULTS,
  H6_DEFAULTS,
  UL_DEFAULTS,
  OL_DEFAULTS,
  LI_DEFAULTS,
  BUTTON_DEFAULTS,
  INPUT_DEFAULTS,
  TEXTAREA_DEFAULTS,
  SELECT_DEFAULTS,
  IMG_DEFAULTS,
  HR_DEFAULTS,
} = require('./defaults');

const {
  applyStyles,
  parseDimension,
} = require('./applyStyles');

/**
 * Creates the full Yoga layout configuration for an element.
 *
 * Merges the element-type defaults with any user-supplied style props and
 * returns a config object ready to be sent across the JS-to-native bridge.
 * On the native side, the bridge handler reads these values and calls the
 * corresponding YGNodeStyleSet* functions on the Yoga node.
 *
 * @param {string} elementType - HTML element name ('div', 'span', 'p', etc.)
 * @param {object} [styles] - User-supplied style props from JSX.
 * @returns {object} Yoga layout config object.
 */
function createLayoutConfig(elementType, styles) {
  const defaults = getDefaultsForElement(elementType);
  return applyStyles(defaults, styles);
}

module.exports = {
  // Primary API
  createLayoutConfig,
  applyStyles,
  getDefaultsForElement,
  parseDimension,

  // Element defaults
  ELEMENT_DEFAULTS,
  BLOCK_DEFAULTS,
  SPAN_DEFAULTS,
  P_DEFAULTS,
  H1_DEFAULTS,
  H2_DEFAULTS,
  H3_DEFAULTS,
  H4_DEFAULTS,
  H5_DEFAULTS,
  H6_DEFAULTS,
  UL_DEFAULTS,
  OL_DEFAULTS,
  LI_DEFAULTS,
  BUTTON_DEFAULTS,
  INPUT_DEFAULTS,
  TEXTAREA_DEFAULTS,
  SELECT_DEFAULTS,
  IMG_DEFAULTS,
  HR_DEFAULTS,

  // Yoga constants
  FlexDirection,
  Justify,
  Align,
  PositionType,
  Wrap,
  Overflow,
  Display,
  Direction,
  Edge,
  Gutter,
  NodeType,
  BoxSizing,
};
