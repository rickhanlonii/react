'use strict';

/**
 * Yoga enum constants.
 *
 * These mirror the YG* C enums so that JS-side style configs can reference them
 * by name.  The integer values match the Yoga C API — the native bridge uses
 * them directly when calling YGNodeStyleSet* functions.
 */

// YGFlexDirection
const FlexDirection = Object.freeze({
  Column: 0,
  ColumnReverse: 1,
  Row: 2,
  RowReverse: 3,
});

// YGJustify
const Justify = Object.freeze({
  FlexStart: 0,
  Center: 1,
  FlexEnd: 2,
  SpaceBetween: 3,
  SpaceAround: 4,
  SpaceEvenly: 5,
});

// YGAlign
const Align = Object.freeze({
  Auto: 0,
  FlexStart: 1,
  Center: 2,
  FlexEnd: 3,
  Stretch: 4,
  Baseline: 5,
  SpaceBetween: 6,
  SpaceAround: 7,
  SpaceEvenly: 8,
});

// YGPositionType
const PositionType = Object.freeze({
  Static: 0,
  Relative: 1,
  Absolute: 2,
});

// YGWrap
const Wrap = Object.freeze({
  NoWrap: 0,
  Wrap: 1,
  WrapReverse: 2,
});

// YGOverflow
const Overflow = Object.freeze({
  Visible: 0,
  Hidden: 1,
  Scroll: 2,
});

// YGDisplay
const Display = Object.freeze({
  Flex: 0,
  None: 1,
  Contents: 2,
});

// YGDirection
const Direction = Object.freeze({
  Inherit: 0,
  LTR: 1,
  RTL: 2,
});

// YGEdge
const Edge = Object.freeze({
  Left: 0,
  Top: 1,
  Right: 2,
  Bottom: 3,
  Start: 4,
  End: 5,
  Horizontal: 6,
  Vertical: 7,
  All: 8,
});

// YGGutter
const Gutter = Object.freeze({
  Column: 0,
  Row: 1,
  All: 2,
});

// YGNodeType
const NodeType = Object.freeze({
  Default: 0,
  Text: 1,
});

// YGBoxSizing
const BoxSizing = Object.freeze({
  BorderBox: 0,
  ContentBox: 1,
});

module.exports = {
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
