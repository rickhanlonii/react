'use strict';

const {
  FlexDirection,
  Justify,
  Align,
  PositionType,
  Wrap,
  Overflow,
  Display,
  Edge,
  Gutter,
} = require('./YogaConstants');

/**
 * Maps from CSS-style string values to Yoga enum integers.
 *
 * These maps are used by applyStyles() to translate human-readable style prop
 * values (e.g. 'row', 'center') into the integer constants that the native
 * bridge passes directly to the Yoga C API.
 */
const FLEX_DIRECTION_MAP = Object.freeze({
  column: FlexDirection.Column,
  'column-reverse': FlexDirection.ColumnReverse,
  row: FlexDirection.Row,
  'row-reverse': FlexDirection.RowReverse,
});

const JUSTIFY_CONTENT_MAP = Object.freeze({
  'flex-start': Justify.FlexStart,
  center: Justify.Center,
  'flex-end': Justify.FlexEnd,
  'space-between': Justify.SpaceBetween,
  'space-around': Justify.SpaceAround,
  'space-evenly': Justify.SpaceEvenly,
});

const ALIGN_MAP = Object.freeze({
  auto: Align.Auto,
  'flex-start': Align.FlexStart,
  center: Align.Center,
  'flex-end': Align.FlexEnd,
  stretch: Align.Stretch,
  baseline: Align.Baseline,
  'space-between': Align.SpaceBetween,
  'space-around': Align.SpaceAround,
  'space-evenly': Align.SpaceEvenly,
});

const POSITION_MAP = Object.freeze({
  static: PositionType.Static,
  relative: PositionType.Relative,
  absolute: PositionType.Absolute,
});

const WRAP_MAP = Object.freeze({
  nowrap: Wrap.NoWrap,
  wrap: Wrap.Wrap,
  'wrap-reverse': Wrap.WrapReverse,
});

const OVERFLOW_MAP = Object.freeze({
  visible: Overflow.Visible,
  hidden: Overflow.Hidden,
  scroll: Overflow.Scroll,
});

const DISPLAY_MAP = Object.freeze({
  flex: Display.Flex,
  none: Display.None,
  contents: Display.Contents,
});

/**
 * Parses a dimension value that may be a number (points), a percentage string
 * (e.g. '50%'), or the string 'auto'.
 *
 * @param {number|string} value
 * @returns {{ value: number, unit: 'point'|'percent'|'auto' }}
 */
function parseDimension(value) {
  if (value === 'auto') {
    return {value: 0, unit: 'auto'};
  }
  if (typeof value === 'string' && value.endsWith('%')) {
    return {value: parseFloat(value), unit: 'percent'};
  }
  return {value: Number(value), unit: 'point'};
}

/**
 * Applies CSS-like style props to a Yoga layout config object.
 *
 * Takes user-supplied style properties and converts them into a flat object
 * of Yoga-compatible key/value pairs.  The output object is what gets sent
 * across the JS-to-native bridge and applied to the Yoga node on the native
 * side.
 *
 * The returned config merges element-type defaults with the provided styles.
 * Explicit styles always override defaults.
 *
 * @param {object} defaults - Default layout config for the element type
 *   (from getDefaultsForElement).
 * @param {object} [styles] - User-supplied style props (e.g. from JSX
 *   `style` attribute).
 * @returns {object} Merged Yoga config object ready for the bridge.
 */
function applyStyles(defaults, styles) {
  if (!styles || typeof styles !== 'object') {
    // No user styles — return a copy of the defaults.
    return Object.assign({}, defaults);
  }

  const config = Object.assign({}, defaults);

  // --- Flex container properties ---

  if (styles.flexDirection != null) {
    const mapped =
      typeof styles.flexDirection === 'string'
        ? FLEX_DIRECTION_MAP[styles.flexDirection]
        : styles.flexDirection;
    if (mapped != null) {
      config.flexDirection = mapped;
    }
  }

  if (styles.justifyContent != null) {
    const mapped =
      typeof styles.justifyContent === 'string'
        ? JUSTIFY_CONTENT_MAP[styles.justifyContent]
        : styles.justifyContent;
    if (mapped != null) {
      config.justifyContent = mapped;
    }
  }

  if (styles.alignItems != null) {
    const mapped =
      typeof styles.alignItems === 'string'
        ? ALIGN_MAP[styles.alignItems]
        : styles.alignItems;
    if (mapped != null) {
      config.alignItems = mapped;
    }
  }

  if (styles.alignSelf != null) {
    const mapped =
      typeof styles.alignSelf === 'string'
        ? ALIGN_MAP[styles.alignSelf]
        : styles.alignSelf;
    if (mapped != null) {
      config.alignSelf = mapped;
    }
  }

  if (styles.alignContent != null) {
    const mapped =
      typeof styles.alignContent === 'string'
        ? ALIGN_MAP[styles.alignContent]
        : styles.alignContent;
    if (mapped != null) {
      config.alignContent = mapped;
    }
  }

  if (styles.flexWrap != null) {
    const mapped =
      typeof styles.flexWrap === 'string'
        ? WRAP_MAP[styles.flexWrap]
        : styles.flexWrap;
    if (mapped != null) {
      config.flexWrap = mapped;
    }
  }

  if (styles.overflow != null) {
    const mapped =
      typeof styles.overflow === 'string'
        ? OVERFLOW_MAP[styles.overflow]
        : styles.overflow;
    if (mapped != null) {
      config.overflow = mapped;
    }
  }

  if (styles.display != null) {
    const mapped =
      typeof styles.display === 'string'
        ? DISPLAY_MAP[styles.display]
        : styles.display;
    if (mapped != null) {
      config.display = mapped;
    }
  }

  if (styles.position != null) {
    const mapped =
      typeof styles.position === 'string'
        ? POSITION_MAP[styles.position]
        : styles.position;
    if (mapped != null) {
      config.positionType = mapped;
    }
  }

  // --- Flex item properties ---

  if (styles.flex != null) {
    config.flex = Number(styles.flex);
  }

  if (styles.flexGrow != null) {
    config.flexGrow = Number(styles.flexGrow);
  }

  if (styles.flexShrink != null) {
    config.flexShrink = Number(styles.flexShrink);
  }

  if (styles.flexBasis != null) {
    config.flexBasis = parseDimension(styles.flexBasis);
  }

  // --- Dimensions ---

  if (styles.width != null) {
    config.width = parseDimension(styles.width);
  }

  if (styles.height != null) {
    config.height = parseDimension(styles.height);
  }

  if (styles.minWidth != null) {
    config.minWidth = parseDimension(styles.minWidth);
  }

  if (styles.minHeight != null) {
    config.minHeight = parseDimension(styles.minHeight);
  }

  if (styles.maxWidth != null) {
    config.maxWidth = parseDimension(styles.maxWidth);
  }

  if (styles.maxHeight != null) {
    config.maxHeight = parseDimension(styles.maxHeight);
  }

  // --- Margins ---

  if (styles.margin != null) {
    const dim = parseDimension(styles.margin);
    config.marginTop = dim;
    config.marginRight = dim;
    config.marginBottom = dim;
    config.marginLeft = dim;
  }

  if (styles.marginTop != null) {
    config.marginTop = parseDimension(styles.marginTop);
  }

  if (styles.marginRight != null) {
    config.marginRight = parseDimension(styles.marginRight);
  }

  if (styles.marginBottom != null) {
    config.marginBottom = parseDimension(styles.marginBottom);
  }

  if (styles.marginLeft != null) {
    config.marginLeft = parseDimension(styles.marginLeft);
  }

  if (styles.marginHorizontal != null) {
    const dim = parseDimension(styles.marginHorizontal);
    config.marginLeft = dim;
    config.marginRight = dim;
  }

  if (styles.marginVertical != null) {
    const dim = parseDimension(styles.marginVertical);
    config.marginTop = dim;
    config.marginBottom = dim;
  }

  // --- Padding ---

  if (styles.padding != null) {
    const dim = parseDimension(styles.padding);
    config.paddingTop = dim;
    config.paddingRight = dim;
    config.paddingBottom = dim;
    config.paddingLeft = dim;
  }

  if (styles.paddingTop != null) {
    config.paddingTop = parseDimension(styles.paddingTop);
  }

  if (styles.paddingRight != null) {
    config.paddingRight = parseDimension(styles.paddingRight);
  }

  if (styles.paddingBottom != null) {
    config.paddingBottom = parseDimension(styles.paddingBottom);
  }

  if (styles.paddingLeft != null) {
    config.paddingLeft = parseDimension(styles.paddingLeft);
  }

  if (styles.paddingHorizontal != null) {
    const dim = parseDimension(styles.paddingHorizontal);
    config.paddingLeft = dim;
    config.paddingRight = dim;
  }

  if (styles.paddingVertical != null) {
    const dim = parseDimension(styles.paddingVertical);
    config.paddingTop = dim;
    config.paddingBottom = dim;
  }

  // --- Border widths ---

  if (styles.borderWidth != null) {
    const val = Number(styles.borderWidth);
    config.borderTopWidth = val;
    config.borderRightWidth = val;
    config.borderBottomWidth = val;
    config.borderLeftWidth = val;
  }

  if (styles.borderTopWidth != null) {
    config.borderTopWidth = Number(styles.borderTopWidth);
  }

  if (styles.borderRightWidth != null) {
    config.borderRightWidth = Number(styles.borderRightWidth);
  }

  if (styles.borderBottomWidth != null) {
    config.borderBottomWidth = Number(styles.borderBottomWidth);
  }

  if (styles.borderLeftWidth != null) {
    config.borderLeftWidth = Number(styles.borderLeftWidth);
  }

  // --- Position offsets ---

  if (styles.top != null) {
    config.top = parseDimension(styles.top);
  }

  if (styles.right != null) {
    config.right = parseDimension(styles.right);
  }

  if (styles.bottom != null) {
    config.bottom = parseDimension(styles.bottom);
  }

  if (styles.left != null) {
    config.left = parseDimension(styles.left);
  }

  // --- Gap ---

  if (styles.gap != null) {
    config.gap = Number(styles.gap);
  }

  if (styles.rowGap != null) {
    config.rowGap = Number(styles.rowGap);
  }

  if (styles.columnGap != null) {
    config.columnGap = Number(styles.columnGap);
  }

  // --- Aspect ratio ---

  if (styles.aspectRatio != null) {
    config.aspectRatio = Number(styles.aspectRatio);
  }

  return config;
}

module.exports = {
  applyStyles,
  parseDimension,
  // Export maps for testing / advanced usage
  FLEX_DIRECTION_MAP,
  JUSTIFY_CONTENT_MAP,
  ALIGN_MAP,
  POSITION_MAP,
  WRAP_MAP,
  OVERFLOW_MAP,
  DISPLAY_MAP,
};
