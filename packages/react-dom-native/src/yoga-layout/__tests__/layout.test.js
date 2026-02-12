'use strict';

const {
  createLayoutConfig,
  applyStyles,
  getDefaultsForElement,
  parseDimension,
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
} = require('../index');

// ---------------------------------------------------------------------------
// YogaConstants
// ---------------------------------------------------------------------------

describe('YogaConstants', () => {
  test('FlexDirection enum values match Yoga C API', () => {
    expect(FlexDirection.Column).toBe(0);
    expect(FlexDirection.ColumnReverse).toBe(1);
    expect(FlexDirection.Row).toBe(2);
    expect(FlexDirection.RowReverse).toBe(3);
  });

  test('Justify enum values', () => {
    expect(Justify.FlexStart).toBe(0);
    expect(Justify.Center).toBe(1);
    expect(Justify.FlexEnd).toBe(2);
    expect(Justify.SpaceBetween).toBe(3);
    expect(Justify.SpaceAround).toBe(4);
    expect(Justify.SpaceEvenly).toBe(5);
  });

  test('Align enum values', () => {
    expect(Align.Auto).toBe(0);
    expect(Align.FlexStart).toBe(1);
    expect(Align.Center).toBe(2);
    expect(Align.FlexEnd).toBe(3);
    expect(Align.Stretch).toBe(4);
    expect(Align.Baseline).toBe(5);
  });

  test('Display enum values', () => {
    expect(Display.Flex).toBe(0);
    expect(Display.None).toBe(1);
    expect(Display.Contents).toBe(2);
  });

  test('PositionType enum values', () => {
    expect(PositionType.Static).toBe(0);
    expect(PositionType.Relative).toBe(1);
    expect(PositionType.Absolute).toBe(2);
  });

  test('NodeType enum values', () => {
    expect(NodeType.Default).toBe(0);
    expect(NodeType.Text).toBe(1);
  });

  test('enum objects are frozen', () => {
    expect(Object.isFrozen(FlexDirection)).toBe(true);
    expect(Object.isFrozen(Justify)).toBe(true);
    expect(Object.isFrozen(Align)).toBe(true);
    expect(Object.isFrozen(Display)).toBe(true);
    expect(Object.isFrozen(Edge)).toBe(true);
    expect(Object.isFrozen(Gutter)).toBe(true);
    expect(Object.isFrozen(BoxSizing)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Element defaults
// ---------------------------------------------------------------------------

describe('Element defaults', () => {
  test('div defaults to empty (all Yoga defaults)', () => {
    const defaults = getDefaultsForElement('div');
    expect(defaults).toBe(BLOCK_DEFAULTS);
    expect(Object.keys(defaults)).toHaveLength(0);
  });

  test('block container elements share BLOCK_DEFAULTS', () => {
    const blockElements = [
      'div',
      'main',
      'section',
      'article',
      'nav',
      'header',
      'footer',
      'aside',
      'form',
    ];
    for (const el of blockElements) {
      expect(getDefaultsForElement(el)).toBe(BLOCK_DEFAULTS);
    }
  });

  test('span defaults to row direction and flexShrink 1', () => {
    const defaults = getDefaultsForElement('span');
    expect(defaults).toBe(SPAN_DEFAULTS);
    expect(defaults.flexDirection).toBe(FlexDirection.Row);
    expect(defaults.flexShrink).toBe(1);
  });

  test('p has margins and text node type', () => {
    const defaults = getDefaultsForElement('p');
    expect(defaults).toBe(P_DEFAULTS);
    expect(defaults.marginTop).toBe(16);
    expect(defaults.marginBottom).toBe(16);
    expect(defaults.fontSize).toBe(16);
    expect(defaults.nodeType).toBe(NodeType.Text);
  });

  test('h1 has correct font size, margins, and bold weight', () => {
    const defaults = getDefaultsForElement('h1');
    expect(defaults.fontSize).toBe(32);
    expect(defaults.marginTop).toBe(21.4);
    expect(defaults.marginBottom).toBe(21.4);
    expect(defaults.fontWeight).toBe(700);
    expect(defaults.nodeType).toBe(NodeType.Text);
  });

  test('h2 has correct font size and margins', () => {
    const defaults = getDefaultsForElement('h2');
    expect(defaults.fontSize).toBe(24);
    expect(defaults.marginTop).toBe(19.9);
    expect(defaults.marginBottom).toBe(19.9);
    expect(defaults.fontWeight).toBe(700);
  });

  test('h3 has correct font size and margins', () => {
    const defaults = getDefaultsForElement('h3');
    expect(defaults.fontSize).toBe(18.7);
    expect(defaults.marginTop).toBe(18.7);
    expect(defaults.marginBottom).toBe(18.7);
  });

  test('h4 has correct font size and margins', () => {
    const defaults = getDefaultsForElement('h4');
    expect(defaults.fontSize).toBe(16);
    expect(defaults.marginTop).toBe(21.3);
    expect(defaults.marginBottom).toBe(21.3);
  });

  test('h5 has correct font size and margins', () => {
    const defaults = getDefaultsForElement('h5');
    expect(defaults.fontSize).toBe(13.3);
    expect(defaults.marginTop).toBe(22.2);
    expect(defaults.marginBottom).toBe(22.2);
  });

  test('h6 has correct font size and margins', () => {
    const defaults = getDefaultsForElement('h6');
    expect(defaults.fontSize).toBe(10.7);
    expect(defaults.marginTop).toBe(24.9);
    expect(defaults.marginBottom).toBe(24.9);
  });

  test('all headings have bold weight and text node type', () => {
    for (const el of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const defaults = getDefaultsForElement(el);
      expect(defaults.fontWeight).toBe(700);
      expect(defaults.nodeType).toBe(NodeType.Text);
    }
  });

  test('button has centered row layout with padding', () => {
    const defaults = getDefaultsForElement('button');
    expect(defaults.flexDirection).toBe(FlexDirection.Row);
    expect(defaults.alignItems).toBe(Align.Center);
    expect(defaults.justifyContent).toBe(Justify.Center);
    expect(defaults.paddingTop).toBe(4);
    expect(defaults.paddingBottom).toBe(4);
    expect(defaults.paddingLeft).toBe(12);
    expect(defaults.paddingRight).toBe(12);
  });

  test('input has fixed height and horizontal padding', () => {
    const defaults = getDefaultsForElement('input');
    expect(defaults.height).toBe(32);
    expect(defaults.paddingLeft).toBe(4);
    expect(defaults.paddingRight).toBe(4);
  });

  test('textarea has minimum height and padding', () => {
    const defaults = getDefaultsForElement('textarea');
    expect(defaults.minHeight).toBe(48);
    expect(defaults.paddingTop).toBe(4);
    expect(defaults.paddingBottom).toBe(4);
    expect(defaults.paddingLeft).toBe(4);
    expect(defaults.paddingRight).toBe(4);
  });

  test('select has row direction with center alignment and fixed height', () => {
    const defaults = getDefaultsForElement('select');
    expect(defaults.flexDirection).toBe(FlexDirection.Row);
    expect(defaults.alignItems).toBe(Align.Center);
    expect(defaults.height).toBe(32);
    expect(defaults.paddingLeft).toBe(4);
    expect(defaults.paddingRight).toBe(4);
  });

  test('ul and ol have left padding and vertical margins', () => {
    for (const el of ['ul', 'ol']) {
      const defaults = getDefaultsForElement(el);
      expect(defaults.paddingLeft).toBe(40);
      expect(defaults.marginTop).toBe(16);
      expect(defaults.marginBottom).toBe(16);
    }
  });

  test('li has row direction', () => {
    const defaults = getDefaultsForElement('li');
    expect(defaults.flexDirection).toBe(FlexDirection.Row);
  });

  test('img defaults to empty (intrinsic sizing)', () => {
    const defaults = getDefaultsForElement('img');
    expect(defaults).toBe(IMG_DEFAULTS);
    expect(Object.keys(defaults)).toHaveLength(0);
  });

  test('hr has zero height and vertical margins', () => {
    const defaults = getDefaultsForElement('hr');
    expect(defaults.height).toBe(0);
    expect(defaults.marginTop).toBe(8);
    expect(defaults.marginBottom).toBe(8);
  });

  test('unknown element falls back to BLOCK_DEFAULTS', () => {
    const defaults = getDefaultsForElement('custom-element');
    expect(Object.keys(defaults)).toHaveLength(0);
  });

  test('default objects are frozen', () => {
    expect(Object.isFrozen(BLOCK_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(SPAN_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(P_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(BUTTON_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(ELEMENT_DEFAULTS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseDimension
// ---------------------------------------------------------------------------

describe('parseDimension', () => {
  test('parses numeric values as points', () => {
    expect(parseDimension(100)).toEqual({value: 100, unit: 'point'});
    expect(parseDimension(0)).toEqual({value: 0, unit: 'point'});
    expect(parseDimension(3.5)).toEqual({value: 3.5, unit: 'point'});
  });

  test('parses percentage strings', () => {
    expect(parseDimension('50%')).toEqual({value: 50, unit: 'percent'});
    expect(parseDimension('100%')).toEqual({value: 100, unit: 'percent'});
    expect(parseDimension('33.3%')).toEqual({value: 33.3, unit: 'percent'});
  });

  test('parses auto string', () => {
    expect(parseDimension('auto')).toEqual({value: 0, unit: 'auto'});
  });

  test('parses numeric strings as points', () => {
    expect(parseDimension('42')).toEqual({value: 42, unit: 'point'});
  });
});

// ---------------------------------------------------------------------------
// applyStyles
// ---------------------------------------------------------------------------

describe('applyStyles', () => {
  test('returns copy of defaults when no styles provided', () => {
    const result = applyStyles(SPAN_DEFAULTS);
    expect(result).toEqual(SPAN_DEFAULTS);
    expect(result).not.toBe(SPAN_DEFAULTS); // must be a copy
  });

  test('returns copy of defaults when styles is null', () => {
    const result = applyStyles(BLOCK_DEFAULTS, null);
    expect(result).toEqual(BLOCK_DEFAULTS);
    expect(result).not.toBe(BLOCK_DEFAULTS);
  });

  test('returns copy of defaults when styles is empty', () => {
    const result = applyStyles(P_DEFAULTS, {});
    expect(result).toEqual(P_DEFAULTS);
    expect(result).not.toBe(P_DEFAULTS);
  });

  test('explicit style overrides defaults', () => {
    const result = applyStyles(SPAN_DEFAULTS, {
      flexDirection: 'column',
    });
    // The default for span is Row, but we override to Column
    expect(result.flexDirection).toBe(FlexDirection.Column);
    // flexShrink from default is preserved
    expect(result.flexShrink).toBe(1);
  });

  test('applies flexDirection with string values', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {flexDirection: 'row'}).flexDirection,
    ).toBe(FlexDirection.Row);
    expect(
      applyStyles(BLOCK_DEFAULTS, {flexDirection: 'column'}).flexDirection,
    ).toBe(FlexDirection.Column);
    expect(
      applyStyles(BLOCK_DEFAULTS, {flexDirection: 'row-reverse'}).flexDirection,
    ).toBe(FlexDirection.RowReverse);
    expect(
      applyStyles(BLOCK_DEFAULTS, {flexDirection: 'column-reverse'})
        .flexDirection,
    ).toBe(FlexDirection.ColumnReverse);
  });

  test('applies flexDirection with numeric values', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      flexDirection: FlexDirection.Row,
    });
    expect(result.flexDirection).toBe(FlexDirection.Row);
  });

  test('applies justifyContent', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {justifyContent: 'center'}).justifyContent,
    ).toBe(Justify.Center);
    expect(
      applyStyles(BLOCK_DEFAULTS, {justifyContent: 'space-between'})
        .justifyContent,
    ).toBe(Justify.SpaceBetween);
  });

  test('applies alignItems', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {alignItems: 'center'}).alignItems,
    ).toBe(Align.Center);
    expect(
      applyStyles(BLOCK_DEFAULTS, {alignItems: 'flex-end'}).alignItems,
    ).toBe(Align.FlexEnd);
  });

  test('applies alignSelf', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {alignSelf: 'stretch'}).alignSelf,
    ).toBe(Align.Stretch);
  });

  test('applies alignContent', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {alignContent: 'space-around'}).alignContent,
    ).toBe(Align.SpaceAround);
  });

  test('applies flexWrap', () => {
    expect(applyStyles(BLOCK_DEFAULTS, {flexWrap: 'wrap'}).flexWrap).toBe(
      Wrap.Wrap,
    );
    expect(
      applyStyles(BLOCK_DEFAULTS, {flexWrap: 'wrap-reverse'}).flexWrap,
    ).toBe(Wrap.WrapReverse);
  });

  test('applies overflow', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {overflow: 'hidden'}).overflow,
    ).toBe(Overflow.Hidden);
    expect(
      applyStyles(BLOCK_DEFAULTS, {overflow: 'scroll'}).overflow,
    ).toBe(Overflow.Scroll);
  });

  test('applies display', () => {
    expect(applyStyles(BLOCK_DEFAULTS, {display: 'none'}).display).toBe(
      Display.None,
    );
    expect(applyStyles(BLOCK_DEFAULTS, {display: 'flex'}).display).toBe(
      Display.Flex,
    );
  });

  test('applies position as positionType', () => {
    expect(
      applyStyles(BLOCK_DEFAULTS, {position: 'absolute'}).positionType,
    ).toBe(PositionType.Absolute);
    expect(
      applyStyles(BLOCK_DEFAULTS, {position: 'relative'}).positionType,
    ).toBe(PositionType.Relative);
  });

  test('applies flex item properties', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      flex: 1,
      flexGrow: 2,
      flexShrink: 0.5,
    });
    expect(result.flex).toBe(1);
    expect(result.flexGrow).toBe(2);
    expect(result.flexShrink).toBe(0.5);
  });

  test('applies flexBasis with point value', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {flexBasis: 100});
    expect(result.flexBasis).toEqual({value: 100, unit: 'point'});
  });

  test('applies flexBasis with percentage', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {flexBasis: '50%'});
    expect(result.flexBasis).toEqual({value: 50, unit: 'percent'});
  });

  test('applies flexBasis with auto', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {flexBasis: 'auto'});
    expect(result.flexBasis).toEqual({value: 0, unit: 'auto'});
  });

  test('applies width and height', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {width: 200, height: 100});
    expect(result.width).toEqual({value: 200, unit: 'point'});
    expect(result.height).toEqual({value: 100, unit: 'point'});
  });

  test('applies percentage dimensions', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      width: '50%',
      height: '100%',
    });
    expect(result.width).toEqual({value: 50, unit: 'percent'});
    expect(result.height).toEqual({value: 100, unit: 'percent'});
  });

  test('applies min/max dimensions', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      minWidth: 100,
      minHeight: 50,
      maxWidth: 500,
      maxHeight: 300,
    });
    expect(result.minWidth).toEqual({value: 100, unit: 'point'});
    expect(result.minHeight).toEqual({value: 50, unit: 'point'});
    expect(result.maxWidth).toEqual({value: 500, unit: 'point'});
    expect(result.maxHeight).toEqual({value: 300, unit: 'point'});
  });

  test('applies individual margin values', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      marginTop: 10,
      marginRight: 20,
      marginBottom: 30,
      marginLeft: 40,
    });
    expect(result.marginTop).toEqual({value: 10, unit: 'point'});
    expect(result.marginRight).toEqual({value: 20, unit: 'point'});
    expect(result.marginBottom).toEqual({value: 30, unit: 'point'});
    expect(result.marginLeft).toEqual({value: 40, unit: 'point'});
  });

  test('applies margin shorthand to all sides', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {margin: 16});
    expect(result.marginTop).toEqual({value: 16, unit: 'point'});
    expect(result.marginRight).toEqual({value: 16, unit: 'point'});
    expect(result.marginBottom).toEqual({value: 16, unit: 'point'});
    expect(result.marginLeft).toEqual({value: 16, unit: 'point'});
  });

  test('individual margin overrides shorthand', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      margin: 10,
      marginTop: 20,
    });
    // marginTop should be 20 (individual override)
    expect(result.marginTop).toEqual({value: 20, unit: 'point'});
    // others should be 10 (from shorthand)
    expect(result.marginRight).toEqual({value: 10, unit: 'point'});
    expect(result.marginBottom).toEqual({value: 10, unit: 'point'});
    expect(result.marginLeft).toEqual({value: 10, unit: 'point'});
  });

  test('applies marginHorizontal and marginVertical', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      marginHorizontal: 20,
      marginVertical: 10,
    });
    expect(result.marginLeft).toEqual({value: 20, unit: 'point'});
    expect(result.marginRight).toEqual({value: 20, unit: 'point'});
    expect(result.marginTop).toEqual({value: 10, unit: 'point'});
    expect(result.marginBottom).toEqual({value: 10, unit: 'point'});
  });

  test('applies individual padding values', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      paddingTop: 5,
      paddingRight: 10,
      paddingBottom: 15,
      paddingLeft: 20,
    });
    expect(result.paddingTop).toEqual({value: 5, unit: 'point'});
    expect(result.paddingRight).toEqual({value: 10, unit: 'point'});
    expect(result.paddingBottom).toEqual({value: 15, unit: 'point'});
    expect(result.paddingLeft).toEqual({value: 20, unit: 'point'});
  });

  test('applies padding shorthand', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {padding: 8});
    expect(result.paddingTop).toEqual({value: 8, unit: 'point'});
    expect(result.paddingRight).toEqual({value: 8, unit: 'point'});
    expect(result.paddingBottom).toEqual({value: 8, unit: 'point'});
    expect(result.paddingLeft).toEqual({value: 8, unit: 'point'});
  });

  test('applies paddingHorizontal and paddingVertical', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      paddingHorizontal: 16,
      paddingVertical: 8,
    });
    expect(result.paddingLeft).toEqual({value: 16, unit: 'point'});
    expect(result.paddingRight).toEqual({value: 16, unit: 'point'});
    expect(result.paddingTop).toEqual({value: 8, unit: 'point'});
    expect(result.paddingBottom).toEqual({value: 8, unit: 'point'});
  });

  test('applies border widths', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {borderWidth: 2});
    expect(result.borderTopWidth).toBe(2);
    expect(result.borderRightWidth).toBe(2);
    expect(result.borderBottomWidth).toBe(2);
    expect(result.borderLeftWidth).toBe(2);
  });

  test('individual border width overrides shorthand', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      borderWidth: 1,
      borderBottomWidth: 3,
    });
    expect(result.borderTopWidth).toBe(1);
    expect(result.borderRightWidth).toBe(1);
    expect(result.borderBottomWidth).toBe(3);
    expect(result.borderLeftWidth).toBe(1);
  });

  test('applies position offsets', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    });
    expect(result.top).toEqual({value: 10, unit: 'point'});
    expect(result.right).toEqual({value: 20, unit: 'point'});
    expect(result.bottom).toEqual({value: 30, unit: 'point'});
    expect(result.left).toEqual({value: 40, unit: 'point'});
  });

  test('applies percentage position offsets', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {top: '10%', left: '20%'});
    expect(result.top).toEqual({value: 10, unit: 'percent'});
    expect(result.left).toEqual({value: 20, unit: 'percent'});
  });

  test('applies gap properties', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {
      gap: 10,
      rowGap: 15,
      columnGap: 20,
    });
    expect(result.gap).toBe(10);
    expect(result.rowGap).toBe(15);
    expect(result.columnGap).toBe(20);
  });

  test('applies aspectRatio', () => {
    const result = applyStyles(BLOCK_DEFAULTS, {aspectRatio: 1.5});
    expect(result.aspectRatio).toBe(1.5);
  });

  test('does not mutate the defaults object', () => {
    const before = {...SPAN_DEFAULTS};
    applyStyles(SPAN_DEFAULTS, {flexDirection: 'column', flexGrow: 1});
    expect(SPAN_DEFAULTS).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// createLayoutConfig
// ---------------------------------------------------------------------------

describe('createLayoutConfig', () => {
  test('div with no styles returns empty config (all Yoga defaults)', () => {
    const config = createLayoutConfig('div');
    expect(Object.keys(config)).toHaveLength(0);
  });

  test('div with children lays out vertically (column direction)', () => {
    // div's default flexDirection is Column (Yoga default, not explicitly set).
    // When no flexDirection is in the config, Yoga uses Column.
    const config = createLayoutConfig('div');
    expect(config.flexDirection).toBeUndefined();
    // Confirm Yoga's default matches column (absent means column)
  });

  test('span children lay out horizontally (row direction)', () => {
    const config = createLayoutConfig('span');
    expect(config.flexDirection).toBe(FlexDirection.Row);
    expect(config.flexShrink).toBe(1);
  });

  test('explicit style overrides element defaults', () => {
    // span defaults to row, but we override to column
    const config = createLayoutConfig('span', {flexDirection: 'column'});
    expect(config.flexDirection).toBe(FlexDirection.Column);
    // flexShrink from span default is preserved
    expect(config.flexShrink).toBe(1);
  });

  test('explicit flexShrink overrides span default', () => {
    const config = createLayoutConfig('span', {flexShrink: 0});
    expect(config.flexShrink).toBe(0);
    expect(config.flexDirection).toBe(FlexDirection.Row);
  });

  test('nested layout scenario: div > div + span configs', () => {
    // Parent div: column layout, 100% width
    const parent = createLayoutConfig('div', {width: '100%'});
    expect(parent.width).toEqual({value: 100, unit: 'percent'});
    expect(parent.flexDirection).toBeUndefined(); // column by Yoga default

    // Child div: fixed height
    const child1 = createLayoutConfig('div', {height: 50});
    expect(child1.height).toEqual({value: 50, unit: 'point'});

    // Child span: row direction from default
    const child2 = createLayoutConfig('span');
    expect(child2.flexDirection).toBe(FlexDirection.Row);
  });

  test('heading config includes typography defaults', () => {
    const config = createLayoutConfig('h1');
    expect(config.fontSize).toBe(32);
    expect(config.fontWeight).toBe(700);
    expect(config.marginTop).toBe(21.4);
    expect(config.marginBottom).toBe(21.4);
    expect(config.nodeType).toBe(NodeType.Text);
  });

  test('heading with custom margin overrides default margin', () => {
    const config = createLayoutConfig('h1', {marginTop: 0, marginBottom: 0});
    expect(config.marginTop).toEqual({value: 0, unit: 'point'});
    expect(config.marginBottom).toEqual({value: 0, unit: 'point'});
    // fontSize and fontWeight from defaults are preserved
    expect(config.fontSize).toBe(32);
    expect(config.fontWeight).toBe(700);
  });

  test('paragraph config includes vertical margins', () => {
    const config = createLayoutConfig('p');
    expect(config.marginTop).toBe(16);
    expect(config.marginBottom).toBe(16);
    expect(config.nodeType).toBe(NodeType.Text);
  });

  test('button with custom padding overrides default padding', () => {
    const config = createLayoutConfig('button', {
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 24,
      paddingRight: 24,
    });
    expect(config.paddingTop).toEqual({value: 8, unit: 'point'});
    expect(config.paddingBottom).toEqual({value: 8, unit: 'point'});
    expect(config.paddingLeft).toEqual({value: 24, unit: 'point'});
    expect(config.paddingRight).toEqual({value: 24, unit: 'point'});
    // flexDirection and alignment from defaults are preserved
    expect(config.flexDirection).toBe(FlexDirection.Row);
    expect(config.alignItems).toBe(Align.Center);
    expect(config.justifyContent).toBe(Justify.Center);
  });

  test('input with custom height overrides default', () => {
    const config = createLayoutConfig('input', {height: 48});
    expect(config.height).toEqual({value: 48, unit: 'point'});
    // paddingLeft/Right from defaults preserved
    expect(config.paddingLeft).toBe(4);
    expect(config.paddingRight).toBe(4);
  });

  test('unknown element gets block defaults', () => {
    const config = createLayoutConfig('custom-thing');
    expect(Object.keys(config)).toHaveLength(0);
  });

  test('complex nested layout: absolute positioned child', () => {
    const parent = createLayoutConfig('div', {
      width: 300,
      height: 400,
    });
    expect(parent.width).toEqual({value: 300, unit: 'point'});
    expect(parent.height).toEqual({value: 400, unit: 'point'});

    const child = createLayoutConfig('div', {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
    expect(child.positionType).toBe(PositionType.Absolute);
    expect(child.top).toEqual({value: 0, unit: 'point'});
    expect(child.left).toEqual({value: 0, unit: 'point'});
    expect(child.right).toEqual({value: 0, unit: 'point'});
    expect(child.bottom).toEqual({value: 0, unit: 'point'});
  });

  test('list layout: ul with li children', () => {
    const ul = createLayoutConfig('ul');
    expect(ul.paddingLeft).toBe(40);
    expect(ul.marginTop).toBe(16);
    expect(ul.marginBottom).toBe(16);

    const li = createLayoutConfig('li');
    expect(li.flexDirection).toBe(FlexDirection.Row);
  });

  test('hr has zero height and margins', () => {
    const config = createLayoutConfig('hr');
    expect(config.height).toBe(0);
    expect(config.marginTop).toBe(8);
    expect(config.marginBottom).toBe(8);
  });

  test('textarea config includes min height and padding', () => {
    const config = createLayoutConfig('textarea');
    expect(config.minHeight).toBe(48);
    expect(config.paddingTop).toBe(4);
    expect(config.paddingBottom).toBe(4);
  });

  test('select config includes row direction and fixed height', () => {
    const config = createLayoutConfig('select');
    expect(config.flexDirection).toBe(FlexDirection.Row);
    expect(config.alignItems).toBe(Align.Center);
    expect(config.height).toBe(32);
  });
});
