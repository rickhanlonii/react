'use strict';

const {FlexDirection, Align, Justify, NodeType} = require('./YogaConstants');

/**
 * Default Yoga layout configuration per HTML element type.
 *
 * Each entry describes the Yoga style properties that should be applied when a
 * shadow node is first created for the given element type.  These emulate CSS
 * browser defaults using Yoga's flexbox model.
 *
 * Properties that already match Yoga defaults (flexDirection: Column,
 * alignItems: Stretch, positionType: Relative, boxSizing: BorderBox,
 * flexShrink: 0, display: Flex) are omitted — the native side applies Yoga
 * defaults automatically.
 *
 * Non-layout properties like fontSize and fontWeight are included here because
 * the native side needs them to set up text measurement and rendering for
 * heading/paragraph elements.
 */

// Block container elements — all match Yoga defaults, so no overrides needed.
const BLOCK_DEFAULTS = Object.freeze({});

// Paragraph
const P_DEFAULTS = Object.freeze({
  marginTop: 16,
  marginBottom: 16,
  fontSize: 16,
  nodeType: NodeType.Text,
});

// Headings
const H1_DEFAULTS = Object.freeze({
  marginTop: 21.4,
  marginBottom: 21.4,
  fontSize: 32,
  fontWeight: 700,
  nodeType: NodeType.Text,
});

const H2_DEFAULTS = Object.freeze({
  marginTop: 19.9,
  marginBottom: 19.9,
  fontSize: 24,
  fontWeight: 700,
  nodeType: NodeType.Text,
});

const H3_DEFAULTS = Object.freeze({
  marginTop: 18.7,
  marginBottom: 18.7,
  fontSize: 18.7,
  fontWeight: 700,
  nodeType: NodeType.Text,
});

const H4_DEFAULTS = Object.freeze({
  marginTop: 21.3,
  marginBottom: 21.3,
  fontSize: 16,
  fontWeight: 700,
  nodeType: NodeType.Text,
});

const H5_DEFAULTS = Object.freeze({
  marginTop: 22.2,
  marginBottom: 22.2,
  fontSize: 13.3,
  fontWeight: 700,
  nodeType: NodeType.Text,
});

const H6_DEFAULTS = Object.freeze({
  marginTop: 24.9,
  marginBottom: 24.9,
  fontSize: 10.7,
  fontWeight: 700,
  nodeType: NodeType.Text,
});

// Inline text — when used outside a text context, rendered as a UIView.
// flexDirection: Row for horizontal inline-like flow.
// flexShrink: 1 so that inline elements can shrink (CSS inline behavior).
const SPAN_DEFAULTS = Object.freeze({
  flexDirection: FlexDirection.Row,
  flexShrink: 1,
});

// Lists
const UL_DEFAULTS = Object.freeze({
  paddingLeft: 40,
  marginTop: 16,
  marginBottom: 16,
});

const OL_DEFAULTS = Object.freeze({
  paddingLeft: 40,
  marginTop: 16,
  marginBottom: 16,
});

const LI_DEFAULTS = Object.freeze({
  flexDirection: FlexDirection.Row,
});

// Interactive elements
const BUTTON_DEFAULTS = Object.freeze({
  flexDirection: FlexDirection.Row,
  alignItems: Align.Center,
  justifyContent: Justify.Center,
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 12,
  paddingRight: 12,
});

const INPUT_DEFAULTS = Object.freeze({
  height: 32,
  paddingLeft: 4,
  paddingRight: 4,
});

const TEXTAREA_DEFAULTS = Object.freeze({
  minHeight: 48,
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 4,
  paddingRight: 4,
});

const SELECT_DEFAULTS = Object.freeze({
  flexDirection: FlexDirection.Row,
  alignItems: Align.Center,
  height: 32,
  paddingLeft: 4,
  paddingRight: 4,
});

// Media
const IMG_DEFAULTS = Object.freeze({});

// Formatting
const HR_DEFAULTS = Object.freeze({
  height: 0,
  marginTop: 8,
  marginBottom: 8,
});

/**
 * Map from HTML element type string to its Yoga layout defaults.
 *
 * Block container elements (div, main, section, article, nav, header, footer,
 * aside, form) all share BLOCK_DEFAULTS (empty — Yoga defaults suffice).
 */
const ELEMENT_DEFAULTS = Object.freeze({
  // Block containers
  div: BLOCK_DEFAULTS,
  main: BLOCK_DEFAULTS,
  section: BLOCK_DEFAULTS,
  article: BLOCK_DEFAULTS,
  nav: BLOCK_DEFAULTS,
  header: BLOCK_DEFAULTS,
  footer: BLOCK_DEFAULTS,
  aside: BLOCK_DEFAULTS,
  form: BLOCK_DEFAULTS,

  // Text containers
  p: P_DEFAULTS,
  h1: H1_DEFAULTS,
  h2: H2_DEFAULTS,
  h3: H3_DEFAULTS,
  h4: H4_DEFAULTS,
  h5: H5_DEFAULTS,
  h6: H6_DEFAULTS,

  // Inline
  span: SPAN_DEFAULTS,

  // Lists
  ul: UL_DEFAULTS,
  ol: OL_DEFAULTS,
  li: LI_DEFAULTS,

  // Interactive
  button: BUTTON_DEFAULTS,
  input: INPUT_DEFAULTS,
  textarea: TEXTAREA_DEFAULTS,
  select: SELECT_DEFAULTS,

  // Media
  img: IMG_DEFAULTS,

  // Formatting
  hr: HR_DEFAULTS,
});

/**
 * Returns the default layout configuration for a given HTML element type.
 *
 * @param {string} elementType - HTML element name (e.g. 'div', 'span', 'p')
 * @returns {object} Frozen object with default Yoga style properties.
 *   Returns BLOCK_DEFAULTS (empty object) for unknown element types.
 */
function getDefaultsForElement(elementType) {
  return ELEMENT_DEFAULTS[elementType] || BLOCK_DEFAULTS;
}

module.exports = {
  ELEMENT_DEFAULTS,
  getDefaultsForElement,
  // Export individual defaults for direct access in tests and components
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
};
