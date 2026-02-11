'use strict';

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
} = require('../index');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('ElementCategory', () => {
  test('has all expected category values', () => {
    expect(ElementCategory.Container).toBe('Container');
    expect(ElementCategory.TextContainer).toBe('TextContainer');
    expect(ElementCategory.VirtualText).toBe('VirtualText');
    expect(ElementCategory.Input).toBe('Input');
    expect(ElementCategory.Select).toBe('Select');
    expect(ElementCategory.Image).toBe('Image');
    expect(ElementCategory.Button).toBe('Button');
    expect(ElementCategory.List).toBe('List');
    expect(ElementCategory.ListItem).toBe('ListItem');
    expect(ElementCategory.HorizontalRule).toBe('HorizontalRule');
    expect(ElementCategory.Video).toBe('Video');
  });

  test('is frozen', () => {
    expect(Object.isFrozen(ElementCategory)).toBe(true);
  });
});

describe('ViewType', () => {
  test('has all expected view type values', () => {
    expect(ViewType.UIView).toBe('UIView');
    expect(ViewType.UIScrollView).toBe('UIScrollView');
    expect(ViewType.UIImageView).toBe('UIImageView');
    expect(ViewType.UITextField).toBe('UITextField');
    expect(ViewType.UITextView).toBe('UITextView');
    expect(ViewType.TextRenderView).toBe('TextRenderView');
    expect(ViewType.Virtual).toBe('Virtual');
  });

  test('is frozen', () => {
    expect(Object.isFrozen(ViewType)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

describe('registerElement', () => {
  test('throws on empty string type', () => {
    expect(() => registerElement('', {
      category: ElementCategory.Container,
      viewType: ViewType.UIView,
    })).toThrow('type must be a non-empty string');
  });

  test('throws on non-string type', () => {
    expect(() => registerElement(123, {
      category: ElementCategory.Container,
      viewType: ViewType.UIView,
    })).toThrow('type must be a non-empty string');
  });

  test('returns a frozen descriptor', () => {
    const descriptor = registerElement('test-frozen-element', {
      category: ElementCategory.Container,
      viewType: ViewType.UIView,
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.yogaDefaults)).toBe(true);
    expect(Object.isFrozen(descriptor.eventSupport)).toBe(true);
    expect(Object.isFrozen(descriptor.defaultStyles)).toBe(true);
    expect(Object.isFrozen(descriptor.textDefaults)).toBe(true);
    expect(Object.isFrozen(descriptor.accessibility)).toBe(true);
  });
});

describe('getElementConfig', () => {
  test('returns null for unknown elements', () => {
    expect(getElementConfig('nonexistent-element')).toBe(null);
  });

  test('returns config for known elements', () => {
    const config = getElementConfig('div');
    expect(config).not.toBe(null);
    expect(config.elementType).toBe('div');
  });
});

describe('isKnownElement', () => {
  test('returns true for registered elements', () => {
    expect(isKnownElement('div')).toBe(true);
    expect(isKnownElement('span')).toBe(true);
    expect(isKnownElement('p')).toBe(true);
    expect(isKnownElement('img')).toBe(true);
    expect(isKnownElement('button')).toBe(true);
  });

  test('returns false for unknown elements', () => {
    expect(isKnownElement('custom-element')).toBe(false);
    expect(isKnownElement('xyz')).toBe(false);
  });
});

describe('getAllElementTypes', () => {
  test('returns an array of strings', () => {
    const types = getAllElementTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) {
      expect(typeof t).toBe('string');
    }
  });

  test('includes all expected P0 elements', () => {
    const types = getAllElementTypes();
    const p0 = ['div', 'span', 'p', 'img', 'button', 'input', 'textarea'];
    for (const el of p0) {
      expect(types).toContain(el);
    }
  });

  test('includes all expected P1 elements', () => {
    const types = getAllElementTypes();
    const p1 = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'a',
      'main', 'section', 'article', 'nav', 'header', 'footer', 'aside',
      'ul', 'ol', 'li',
    ];
    for (const el of p1) {
      expect(types).toContain(el);
    }
  });

  test('includes all expected P2 elements', () => {
    const types = getAllElementTypes();
    const p2 = ['select', 'video', 'hr', 'br'];
    for (const el of p2) {
      expect(types).toContain(el);
    }
  });

  test('includes additional text formatting elements', () => {
    const types = getAllElementTypes();
    const extra = ['b', 'i', 'u', 's', 'label', 'form'];
    for (const el of extra) {
      expect(types).toContain(el);
    }
  });
});

// ---------------------------------------------------------------------------
// Layout Elements (div, semantic containers, ul, ol, li, hr)
// ---------------------------------------------------------------------------

describe('Layout elements', () => {
  describe('div', () => {
    test('has Container category', () => {
      const config = getElementConfig('div');
      expect(config.category).toBe(ElementCategory.Container);
    });

    test('has UIView viewType', () => {
      const config = getElementConfig('div');
      expect(config.viewType).toBe(ViewType.UIView);
    });

    test('has empty yogaDefaults (Yoga defaults suffice)', () => {
      const config = getElementConfig('div');
      expect(Object.keys(config.yogaDefaults)).toHaveLength(0);
    });

    test('can have children', () => {
      const config = getElementConfig('div');
      expect(config.canHaveChildren).toBe(true);
    });

    test('is not a leaf node', () => {
      const config = getElementConfig('div');
      expect(config.isLeafNode).toBe(false);
    });

    test('breaks text context', () => {
      const config = getElementConfig('div');
      expect(config.breaksTextContext).toBe(true);
    });

    test('is not a text container', () => {
      const config = getElementConfig('div');
      expect(config.isTextContainer).toBe(false);
    });

    test('supports click events', () => {
      const config = getElementConfig('div');
      expect(config.eventSupport.supportsClick).toBe(true);
    });

    test('is not an accessibility element', () => {
      const config = getElementConfig('div');
      expect(config.accessibility.isAccessibilityElement).toBe(false);
    });
  });

  describe('semantic containers', () => {
    const elements = [
      {type: 'main', role: 'main'},
      {type: 'section', role: 'region'},
      {type: 'article', role: 'article'},
      {type: 'nav', role: 'navigation'},
      {type: 'header', role: 'banner'},
      {type: 'footer', role: 'contentinfo'},
      {type: 'aside', role: 'complementary'},
      {type: 'form', role: 'form'},
    ];

    for (const {type, role} of elements) {
      test(`${type} has Container category`, () => {
        const config = getElementConfig(type);
        expect(config.category).toBe(ElementCategory.Container);
      });

      test(`${type} has UIView viewType`, () => {
        const config = getElementConfig(type);
        expect(config.viewType).toBe(ViewType.UIView);
      });

      test(`${type} has empty yogaDefaults (same as div)`, () => {
        const config = getElementConfig(type);
        expect(Object.keys(config.yogaDefaults)).toHaveLength(0);
      });

      test(`${type} has accessibility role '${role}'`, () => {
        const config = getElementConfig(type);
        expect(config.accessibility.role).toBe(role);
      });

      test(`${type} breaks text context`, () => {
        const config = getElementConfig(type);
        expect(config.breaksTextContext).toBe(true);
      });

      test(`${type} can have children`, () => {
        const config = getElementConfig(type);
        expect(config.canHaveChildren).toBe(true);
      });
    }
  });

  describe('ul', () => {
    test('has List category', () => {
      const config = getElementConfig('ul');
      expect(config.category).toBe(ElementCategory.List);
    });

    test('has paddingLeft 40 in yogaDefaults', () => {
      const config = getElementConfig('ul');
      expect(config.yogaDefaults.paddingLeft).toBe(40);
    });

    test('has marginTop and marginBottom 16', () => {
      const config = getElementConfig('ul');
      expect(config.yogaDefaults.marginTop).toBe(16);
      expect(config.yogaDefaults.marginBottom).toBe(16);
    });

    test('has list accessibility role', () => {
      const config = getElementConfig('ul');
      expect(config.accessibility.role).toBe('list');
    });
  });

  describe('ol', () => {
    test('has List category', () => {
      const config = getElementConfig('ol');
      expect(config.category).toBe(ElementCategory.List);
    });

    test('has same yogaDefaults as ul', () => {
      const ulConfig = getElementConfig('ul');
      const olConfig = getElementConfig('ol');
      expect(olConfig.yogaDefaults.paddingLeft).toBe(ulConfig.yogaDefaults.paddingLeft);
      expect(olConfig.yogaDefaults.marginTop).toBe(ulConfig.yogaDefaults.marginTop);
      expect(olConfig.yogaDefaults.marginBottom).toBe(ulConfig.yogaDefaults.marginBottom);
    });
  });

  describe('li', () => {
    test('has ListItem category', () => {
      const config = getElementConfig('li');
      expect(config.category).toBe(ElementCategory.ListItem);
    });

    test('has row flexDirection', () => {
      const config = getElementConfig('li');
      expect(config.yogaDefaults.flexDirection).toBe('row');
    });

    test('is an accessibility element', () => {
      const config = getElementConfig('li');
      expect(config.accessibility.isAccessibilityElement).toBe(true);
    });
  });

  describe('hr', () => {
    test('has HorizontalRule category', () => {
      const config = getElementConfig('hr');
      expect(config.category).toBe(ElementCategory.HorizontalRule);
    });

    test('has zero height and margins', () => {
      const config = getElementConfig('hr');
      expect(config.yogaDefaults.height).toBe(0);
      expect(config.yogaDefaults.marginTop).toBe(8);
      expect(config.yogaDefaults.marginBottom).toBe(8);
    });

    test('has border default styles', () => {
      const config = getElementConfig('hr');
      expect(config.defaultStyles.borderTopWidth).toBe(1);
      expect(config.defaultStyles.borderTopColor).toBe('#808080');
    });

    test('is a leaf node with no children', () => {
      const config = getElementConfig('hr');
      expect(config.canHaveChildren).toBe(false);
      expect(config.isLeafNode).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Text Elements (p, h1-h6, span, strong, em, a, etc.)
// ---------------------------------------------------------------------------

describe('Text elements', () => {
  describe('p', () => {
    test('has TextContainer category', () => {
      const config = getElementConfig('p');
      expect(config.category).toBe(ElementCategory.TextContainer);
    });

    test('has TextRenderView viewType', () => {
      const config = getElementConfig('p');
      expect(config.viewType).toBe(ViewType.TextRenderView);
    });

    test('has vertical margins in yogaDefaults', () => {
      const config = getElementConfig('p');
      expect(config.yogaDefaults.marginTop).toBe(16);
      expect(config.yogaDefaults.marginBottom).toBe(16);
    });

    test('has fontSize 16 in textDefaults', () => {
      const config = getElementConfig('p');
      expect(config.textDefaults.fontSize).toBe(16);
    });

    test('is a text container', () => {
      const config = getElementConfig('p');
      expect(config.isTextContainer).toBe(true);
    });

    test('has staticText accessibility trait', () => {
      const config = getElementConfig('p');
      expect(config.accessibility.trait).toBe('staticText');
      expect(config.accessibility.isAccessibilityElement).toBe(true);
    });
  });

  describe('headings (h1-h6)', () => {
    const headingSpecs = [
      {type: 'h1', fontSize: 32, margin: 21.4},
      {type: 'h2', fontSize: 24, margin: 19.9},
      {type: 'h3', fontSize: 18.7, margin: 18.7},
      {type: 'h4', fontSize: 16, margin: 21.3},
      {type: 'h5', fontSize: 13.3, margin: 22.2},
      {type: 'h6', fontSize: 10.7, margin: 24.9},
    ];

    for (const {type, fontSize, margin} of headingSpecs) {
      test(`${type} has TextContainer category`, () => {
        const config = getElementConfig(type);
        expect(config.category).toBe(ElementCategory.TextContainer);
      });

      test(`${type} has TextRenderView viewType`, () => {
        const config = getElementConfig(type);
        expect(config.viewType).toBe(ViewType.TextRenderView);
      });

      test(`${type} has fontSize ${fontSize}`, () => {
        const config = getElementConfig(type);
        expect(config.textDefaults.fontSize).toBe(fontSize);
      });

      test(`${type} has bold fontWeight`, () => {
        const config = getElementConfig(type);
        expect(config.textDefaults.fontWeight).toBe('bold');
      });

      test(`${type} has marginTop and marginBottom ${margin}`, () => {
        const config = getElementConfig(type);
        expect(config.yogaDefaults.marginTop).toBe(margin);
        expect(config.yogaDefaults.marginBottom).toBe(margin);
      });

      test(`${type} is a text container`, () => {
        const config = getElementConfig(type);
        expect(config.isTextContainer).toBe(true);
      });

      test(`${type} has header accessibility trait`, () => {
        const config = getElementConfig(type);
        expect(config.accessibility.trait).toBe('header');
        expect(config.accessibility.role).toBe('heading');
        expect(config.accessibility.isAccessibilityElement).toBe(true);
      });
    }
  });

  describe('span', () => {
    test('has VirtualText category', () => {
      const config = getElementConfig('span');
      expect(config.category).toBe(ElementCategory.VirtualText);
    });

    test('has Virtual viewType (inside text context)', () => {
      const config = getElementConfig('span');
      expect(config.viewType).toBe(ViewType.Virtual);
    });

    test('has UIView fallbackViewType (outside text context)', () => {
      const config = getElementConfig('span');
      expect(config.fallbackViewType).toBe(ViewType.UIView);
    });

    test('has row flexDirection in fallbackYogaDefaults', () => {
      const config = getElementConfig('span');
      expect(config.fallbackYogaDefaults.flexDirection).toBe('row');
      expect(config.fallbackYogaDefaults.flexShrink).toBe(1);
    });

    test('can be virtual', () => {
      const config = getElementConfig('span');
      expect(config.canBeVirtual).toBe(true);
    });

    test('can have children', () => {
      const config = getElementConfig('span');
      expect(config.canHaveChildren).toBe(true);
    });
  });

  describe('strong', () => {
    test('has VirtualText category', () => {
      const config = getElementConfig('strong');
      expect(config.category).toBe(ElementCategory.VirtualText);
    });

    test('has bold fontWeight in textDefaults', () => {
      const config = getElementConfig('strong');
      expect(config.textDefaults.fontWeight).toBe('bold');
    });

    test('can be virtual', () => {
      const config = getElementConfig('strong');
      expect(config.canBeVirtual).toBe(true);
    });
  });

  describe('b', () => {
    test('has same text defaults as strong', () => {
      const strongConfig = getElementConfig('strong');
      const bConfig = getElementConfig('b');
      expect(bConfig.textDefaults.fontWeight).toBe(strongConfig.textDefaults.fontWeight);
    });

    test('can be virtual', () => {
      const config = getElementConfig('b');
      expect(config.canBeVirtual).toBe(true);
    });
  });

  describe('em', () => {
    test('has italic fontStyle in textDefaults', () => {
      const config = getElementConfig('em');
      expect(config.textDefaults.fontStyle).toBe('italic');
    });

    test('can be virtual', () => {
      const config = getElementConfig('em');
      expect(config.canBeVirtual).toBe(true);
    });
  });

  describe('i', () => {
    test('has same text defaults as em', () => {
      const emConfig = getElementConfig('em');
      const iConfig = getElementConfig('i');
      expect(iConfig.textDefaults.fontStyle).toBe(emConfig.textDefaults.fontStyle);
    });
  });

  describe('u', () => {
    test('has underline textDecorationLine', () => {
      const config = getElementConfig('u');
      expect(config.textDefaults.textDecorationLine).toBe('underline');
    });

    test('can be virtual', () => {
      const config = getElementConfig('u');
      expect(config.canBeVirtual).toBe(true);
    });
  });

  describe('s', () => {
    test('has line-through textDecorationLine', () => {
      const config = getElementConfig('s');
      expect(config.textDefaults.textDecorationLine).toBe('line-through');
    });

    test('can be virtual', () => {
      const config = getElementConfig('s');
      expect(config.canBeVirtual).toBe(true);
    });
  });

  describe('a', () => {
    test('has VirtualText category', () => {
      const config = getElementConfig('a');
      expect(config.category).toBe(ElementCategory.VirtualText);
    });

    test('has link accessibility role', () => {
      const config = getElementConfig('a');
      expect(config.accessibility.role).toBe('link');
      expect(config.accessibility.trait).toBe('link');
      expect(config.accessibility.isAccessibilityElement).toBe(true);
    });

    test('has blue color and underline in textDefaults', () => {
      const config = getElementConfig('a');
      expect(config.textDefaults.color).toBe('#007AFF');
      expect(config.textDefaults.textDecorationLine).toBe('underline');
    });

    test('supports href and target props', () => {
      const config = getElementConfig('a');
      expect(config.validProps).toContain('href');
      expect(config.validProps).toContain('target');
    });

    test('can be virtual', () => {
      const config = getElementConfig('a');
      expect(config.canBeVirtual).toBe(true);
    });

    test('has UIView fallback when outside text context', () => {
      const config = getElementConfig('a');
      expect(config.fallbackViewType).toBe(ViewType.UIView);
    });
  });

  describe('label', () => {
    test('has VirtualText category', () => {
      const config = getElementConfig('label');
      expect(config.category).toBe(ElementCategory.VirtualText);
    });

    test('can be virtual', () => {
      const config = getElementConfig('label');
      expect(config.canBeVirtual).toBe(true);
    });

    test('supports htmlFor prop', () => {
      const config = getElementConfig('label');
      expect(config.validProps).toContain('htmlFor');
    });
  });

  describe('br', () => {
    test('has VirtualText category', () => {
      const config = getElementConfig('br');
      expect(config.category).toBe(ElementCategory.VirtualText);
    });

    test('is a leaf node with no children', () => {
      const config = getElementConfig('br');
      expect(config.canHaveChildren).toBe(false);
      expect(config.isLeafNode).toBe(true);
    });

    test('can be virtual', () => {
      const config = getElementConfig('br');
      expect(config.canBeVirtual).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Media Elements (img, video)
// ---------------------------------------------------------------------------

describe('Media elements', () => {
  describe('img', () => {
    test('has Image category', () => {
      const config = getElementConfig('img');
      expect(config.category).toBe(ElementCategory.Image);
    });

    test('has UIImageView viewType', () => {
      const config = getElementConfig('img');
      expect(config.viewType).toBe(ViewType.UIImageView);
    });

    test('is a leaf node', () => {
      const config = getElementConfig('img');
      expect(config.isLeafNode).toBe(true);
      expect(config.canHaveChildren).toBe(false);
    });

    test('has image accessibility role', () => {
      const config = getElementConfig('img');
      expect(config.accessibility.role).toBe('image');
      expect(config.accessibility.isAccessibilityElement).toBe(true);
    });

    test('supports load events', () => {
      const config = getElementConfig('img');
      expect(config.eventSupport.supportsLoad).toBe(true);
    });

    test('supports src, alt, and image-specific props', () => {
      const config = getElementConfig('img');
      expect(config.validProps).toContain('src');
      expect(config.validProps).toContain('alt');
      expect(config.validProps).toContain('onLoad');
      expect(config.validProps).toContain('onError');
      expect(config.validProps).toContain('loading');
    });

    test('has fill objectFit default', () => {
      const config = getElementConfig('img');
      expect(config.defaultStyles.objectFit).toBe('fill');
    });

    test('breaks text context', () => {
      const config = getElementConfig('img');
      expect(config.breaksTextContext).toBe(true);
    });
  });

  describe('video', () => {
    test('has Video category', () => {
      const config = getElementConfig('video');
      expect(config.category).toBe(ElementCategory.Video);
    });

    test('is a leaf node', () => {
      const config = getElementConfig('video');
      expect(config.isLeafNode).toBe(true);
      expect(config.canHaveChildren).toBe(false);
    });

    test('supports media props', () => {
      const config = getElementConfig('video');
      expect(config.validProps).toContain('src');
      expect(config.validProps).toContain('autoPlay');
      expect(config.validProps).toContain('controls');
    });
  });
});

// ---------------------------------------------------------------------------
// Input Elements (button, input, textarea, select)
// ---------------------------------------------------------------------------

describe('Input elements', () => {
  describe('button', () => {
    test('has Button category', () => {
      const config = getElementConfig('button');
      expect(config.category).toBe(ElementCategory.Button);
    });

    test('has UIView viewType', () => {
      const config = getElementConfig('button');
      expect(config.viewType).toBe(ViewType.UIView);
    });

    test('has centered row layout in yogaDefaults', () => {
      const config = getElementConfig('button');
      expect(config.yogaDefaults.flexDirection).toBe('row');
      expect(config.yogaDefaults.alignItems).toBe('center');
      expect(config.yogaDefaults.justifyContent).toBe('center');
    });

    test('has padding in yogaDefaults', () => {
      const config = getElementConfig('button');
      expect(config.yogaDefaults.paddingTop).toBe(4);
      expect(config.yogaDefaults.paddingBottom).toBe(4);
      expect(config.yogaDefaults.paddingLeft).toBe(12);
      expect(config.yogaDefaults.paddingRight).toBe(12);
    });

    test('has button-specific default styles', () => {
      const config = getElementConfig('button');
      expect(config.defaultStyles.borderRadius).toBe(4);
      expect(config.defaultStyles.borderWidth).toBe(1);
      expect(config.defaultStyles.borderColor).toBe('#767676');
      expect(config.defaultStyles.backgroundColor).toBe('#EFEFEF');
    });

    test('has button accessibility role', () => {
      const config = getElementConfig('button');
      expect(config.accessibility.role).toBe('button');
      expect(config.accessibility.isAccessibilityElement).toBe(true);
    });

    test('supports click and focus events', () => {
      const config = getElementConfig('button');
      expect(config.eventSupport.supportsClick).toBe(true);
      expect(config.eventSupport.supportsFocus).toBe(true);
    });

    test('supports disabled prop', () => {
      const config = getElementConfig('button');
      expect(config.validProps).toContain('disabled');
    });

    test('can have children', () => {
      const config = getElementConfig('button');
      expect(config.canHaveChildren).toBe(true);
    });
  });

  describe('input', () => {
    test('has Input category', () => {
      const config = getElementConfig('input');
      expect(config.category).toBe(ElementCategory.Input);
    });

    test('has UITextField viewType', () => {
      const config = getElementConfig('input');
      expect(config.viewType).toBe(ViewType.UITextField);
    });

    test('has height 32 in yogaDefaults', () => {
      const config = getElementConfig('input');
      expect(config.yogaDefaults.height).toBe(32);
    });

    test('has horizontal padding in yogaDefaults', () => {
      const config = getElementConfig('input');
      expect(config.yogaDefaults.paddingLeft).toBe(4);
      expect(config.yogaDefaults.paddingRight).toBe(4);
    });

    test('has input-specific default styles', () => {
      const config = getElementConfig('input');
      expect(config.defaultStyles.borderWidth).toBe(1);
      expect(config.defaultStyles.borderColor).toBe('#767676');
      expect(config.defaultStyles.borderRadius).toBe(2);
      expect(config.defaultStyles.fontSize).toBe(13.3);
      expect(config.defaultStyles.backgroundColor).toBe('#FFFFFF');
    });

    test('is a leaf node', () => {
      const config = getElementConfig('input');
      expect(config.isLeafNode).toBe(true);
      expect(config.canHaveChildren).toBe(false);
    });

    test('supports change and focus events', () => {
      const config = getElementConfig('input');
      expect(config.eventSupport.supportsChange).toBe(true);
      expect(config.eventSupport.supportsFocus).toBe(true);
    });

    test('supports input-specific props', () => {
      const config = getElementConfig('input');
      expect(config.validProps).toContain('type');
      expect(config.validProps).toContain('value');
      expect(config.validProps).toContain('placeholder');
      expect(config.validProps).toContain('onChange');
      expect(config.validProps).toContain('onFocus');
      expect(config.validProps).toContain('onBlur');
      expect(config.validProps).toContain('disabled');
      expect(config.validProps).toContain('maxLength');
      expect(config.validProps).toContain('autoFocus');
      expect(config.validProps).toContain('readOnly');
    });
  });

  describe('textarea', () => {
    test('has Input category', () => {
      const config = getElementConfig('textarea');
      expect(config.category).toBe(ElementCategory.Input);
    });

    test('has UITextView viewType', () => {
      const config = getElementConfig('textarea');
      expect(config.viewType).toBe(ViewType.UITextView);
    });

    test('has minHeight 48 in yogaDefaults', () => {
      const config = getElementConfig('textarea');
      expect(config.yogaDefaults.minHeight).toBe(48);
    });

    test('has padding in yogaDefaults', () => {
      const config = getElementConfig('textarea');
      expect(config.yogaDefaults.paddingTop).toBe(4);
      expect(config.yogaDefaults.paddingBottom).toBe(4);
      expect(config.yogaDefaults.paddingLeft).toBe(4);
      expect(config.yogaDefaults.paddingRight).toBe(4);
    });

    test('is a leaf node', () => {
      const config = getElementConfig('textarea');
      expect(config.isLeafNode).toBe(true);
      expect(config.canHaveChildren).toBe(false);
    });

    test('supports rows prop', () => {
      const config = getElementConfig('textarea');
      expect(config.validProps).toContain('rows');
    });
  });

  describe('select', () => {
    test('has Select category', () => {
      const config = getElementConfig('select');
      expect(config.category).toBe(ElementCategory.Select);
    });

    test('has UIView viewType', () => {
      const config = getElementConfig('select');
      expect(config.viewType).toBe(ViewType.UIView);
    });

    test('has row layout with center alignment in yogaDefaults', () => {
      const config = getElementConfig('select');
      expect(config.yogaDefaults.flexDirection).toBe('row');
      expect(config.yogaDefaults.alignItems).toBe('center');
    });

    test('has height 32 in yogaDefaults', () => {
      const config = getElementConfig('select');
      expect(config.yogaDefaults.height).toBe(32);
    });

    test('has adjustable accessibility trait', () => {
      const config = getElementConfig('select');
      expect(config.accessibility.trait).toBe('adjustable');
      expect(config.accessibility.isAccessibilityElement).toBe(true);
    });

    test('supports change events', () => {
      const config = getElementConfig('select');
      expect(config.eventSupport.supportsChange).toBe(true);
    });

    test('can have children', () => {
      const config = getElementConfig('select');
      expect(config.canHaveChildren).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// getResolvedViewType
// ---------------------------------------------------------------------------

describe('getResolvedViewType', () => {
  test('returns Virtual for span inside text context', () => {
    expect(getResolvedViewType('span', true)).toBe(ViewType.Virtual);
  });

  test('returns UIView (fallback) for span outside text context', () => {
    expect(getResolvedViewType('span', false)).toBe(ViewType.UIView);
  });

  test('returns Virtual for strong inside text context', () => {
    expect(getResolvedViewType('strong', true)).toBe(ViewType.Virtual);
  });

  test('returns UIView (fallback) for strong outside text context', () => {
    expect(getResolvedViewType('strong', false)).toBe(ViewType.UIView);
  });

  test('returns Virtual for em inside text context', () => {
    expect(getResolvedViewType('em', true)).toBe(ViewType.Virtual);
  });

  test('returns Virtual for a inside text context', () => {
    expect(getResolvedViewType('a', true)).toBe(ViewType.Virtual);
  });

  test('returns UIView (fallback) for a outside text context', () => {
    expect(getResolvedViewType('a', false)).toBe(ViewType.UIView);
  });

  test('returns UIView for div regardless of text context', () => {
    expect(getResolvedViewType('div', false)).toBe(ViewType.UIView);
    expect(getResolvedViewType('div', true)).toBe(ViewType.UIView);
  });

  test('returns TextRenderView for p regardless of text context', () => {
    expect(getResolvedViewType('p', false)).toBe(ViewType.TextRenderView);
    expect(getResolvedViewType('p', true)).toBe(ViewType.TextRenderView);
  });

  test('returns UIImageView for img', () => {
    expect(getResolvedViewType('img', false)).toBe(ViewType.UIImageView);
  });

  test('returns UITextField for input', () => {
    expect(getResolvedViewType('input', false)).toBe(ViewType.UITextField);
  });

  test('returns UITextView for textarea', () => {
    expect(getResolvedViewType('textarea', false)).toBe(ViewType.UITextView);
  });

  test('returns UIView for unknown element', () => {
    expect(getResolvedViewType('unknown-element', false)).toBe(ViewType.UIView);
  });

  describe('scroll promotion', () => {
    test('promotes div to UIScrollView with overflow: scroll', () => {
      const result = getResolvedViewType('div', false, {
        style: {overflow: 'scroll'},
      });
      expect(result).toBe(ViewType.UIScrollView);
    });

    test('promotes div to UIScrollView with overflow: auto', () => {
      const result = getResolvedViewType('div', false, {
        style: {overflow: 'auto'},
      });
      expect(result).toBe(ViewType.UIScrollView);
    });

    test('does not promote div with overflow: hidden', () => {
      const result = getResolvedViewType('div', false, {
        style: {overflow: 'hidden'},
      });
      expect(result).toBe(ViewType.UIView);
    });

    test('does not promote div with overflow: visible', () => {
      const result = getResolvedViewType('div', false, {
        style: {overflow: 'visible'},
      });
      expect(result).toBe(ViewType.UIView);
    });

    test('does not promote div with no style', () => {
      const result = getResolvedViewType('div', false, {});
      expect(result).toBe(ViewType.UIView);
    });

    test('does not promote div with no props', () => {
      const result = getResolvedViewType('div', false);
      expect(result).toBe(ViewType.UIView);
    });

    test('does not promote non-UIView elements even with overflow: scroll', () => {
      // img has UIImageView, not UIView, so it should not be promoted
      const result = getResolvedViewType('img', false, {
        style: {overflow: 'scroll'},
      });
      expect(result).toBe(ViewType.UIImageView);
    });

    test('promotes section (UIView container) to UIScrollView with overflow: scroll', () => {
      const result = getResolvedViewType('section', false, {
        style: {overflow: 'scroll'},
      });
      expect(result).toBe(ViewType.UIScrollView);
    });
  });
});

// ---------------------------------------------------------------------------
// Prop sets
// ---------------------------------------------------------------------------

describe('Prop sets', () => {
  test('commonProps includes core props', () => {
    expect(commonProps).toContain('style');
    expect(commonProps).toContain('id');
    expect(commonProps).toContain('key');
    expect(commonProps).toContain('ref');
    expect(commonProps).toContain('onClick');
    expect(commonProps).toContain('onLayout');
    expect(commonProps).toContain('aria-label');
    expect(commonProps).toContain('aria-hidden');
    expect(commonProps).toContain('role');
    expect(commonProps).toContain('className');
  });

  test('textProps includes style and text-related props', () => {
    expect(textProps).toContain('style');
    expect(textProps).toContain('id');
    expect(textProps).toContain('onClick');
  });

  test('inputProps extends commonProps with input-specific props', () => {
    expect(inputProps).toContain('style');
    expect(inputProps).toContain('type');
    expect(inputProps).toContain('value');
    expect(inputProps).toContain('placeholder');
    expect(inputProps).toContain('onChange');
    expect(inputProps).toContain('disabled');
  });

  test('prop arrays are frozen', () => {
    expect(Object.isFrozen(commonProps)).toBe(true);
    expect(Object.isFrozen(textProps)).toBe(true);
    expect(Object.isFrozen(inputProps)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Text context behavior
// ---------------------------------------------------------------------------

describe('Text context behavior', () => {
  test('text containers establish text context', () => {
    const textContainers = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    for (const el of textContainers) {
      const config = getElementConfig(el);
      expect(config.isTextContainer).toBe(true);
    }
  });

  test('virtual text elements can be virtual', () => {
    const virtualTexts = ['span', 'strong', 'em', 'b', 'i', 'u', 's', 'a', 'label', 'br'];
    for (const el of virtualTexts) {
      const config = getElementConfig(el);
      expect(config.canBeVirtual).toBe(true);
    }
  });

  test('block elements break text context', () => {
    const blockElements = [
      'div', 'main', 'section', 'article', 'nav', 'header', 'footer',
      'aside', 'form', 'img', 'button', 'input', 'textarea', 'select',
    ];
    for (const el of blockElements) {
      const config = getElementConfig(el);
      expect(config.breaksTextContext).toBe(true);
    }
  });

  test('virtual text elements have fallback yoga defaults for outside text context', () => {
    const virtualTexts = ['span', 'strong', 'em', 'a'];
    for (const el of virtualTexts) {
      const config = getElementConfig(el);
      expect(config.fallbackYogaDefaults).not.toBe(null);
      expect(config.fallbackYogaDefaults.flexDirection).toBe('row');
      expect(config.fallbackYogaDefaults.flexShrink).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Descriptor shape consistency
// ---------------------------------------------------------------------------

describe('Descriptor shape consistency', () => {
  test('all registered elements have required fields', () => {
    const allTypes = getAllElementTypes();
    for (const type of allTypes) {
      const config = getElementConfig(type);
      expect(config.elementType).toBe(type);
      expect(typeof config.category).toBe('string');
      expect(typeof config.viewType).toBe('string');
      expect(typeof config.yogaDefaults).toBe('object');
      expect(typeof config.defaultStyles).toBe('object');
      expect(typeof config.textDefaults).toBe('object');
      expect(typeof config.accessibility).toBe('object');
      expect(typeof config.eventSupport).toBe('object');
      expect(Array.isArray(config.validProps)).toBe(true);
      expect(typeof config.canHaveChildren).toBe('boolean');
      expect(typeof config.isLeafNode).toBe('boolean');
      expect(typeof config.canBeVirtual).toBe('boolean');
      expect(typeof config.isTextContainer).toBe('boolean');
      expect(typeof config.breaksTextContext).toBe('boolean');
    }
  });

  test('eventSupport has all boolean fields with defaults', () => {
    const allTypes = getAllElementTypes();
    for (const type of allTypes) {
      const config = getElementConfig(type);
      const es = config.eventSupport;
      expect(typeof es.supportsClick).toBe('boolean');
      expect(typeof es.supportsTouch).toBe('boolean');
      expect(typeof es.supportsScroll).toBe('boolean');
      expect(typeof es.supportsChange).toBe('boolean');
      expect(typeof es.supportsFocus).toBe('boolean');
      expect(typeof es.supportsLoad).toBe('boolean');
    }
  });

  test('leaf nodes cannot have children', () => {
    const allTypes = getAllElementTypes();
    for (const type of allTypes) {
      const config = getElementConfig(type);
      if (config.isLeafNode) {
        expect(config.canHaveChildren).toBe(false);
      }
    }
  });
});
