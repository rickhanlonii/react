'use strict';

/**
 * Media Elements
 *
 * Registers media-related HTML elements:
 * img, video
 */

const {
  registerElement,
  ElementCategory,
  ViewType,
  commonProps,
} = require('../registry');

// ---------------------------------------------------------------------------
// img — image
// ---------------------------------------------------------------------------
registerElement('img', {
  category: ElementCategory.Image,
  viewType: ViewType.UIImageView,
  yogaDefaults: {},
  defaultStyles: {
    objectFit: 'fill',
  },
  accessibility: {
    role: 'image',
    trait: 'image',
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
    supportsLoad: true,
  },
  validProps: [
    ...commonProps,
    'src',
    'alt',
    'width',
    'height',
    'onLoad',
    'onError',
    'loading',
  ],
  canHaveChildren: false,
  isLeafNode: true,
  breaksTextContext: true,
});

// ---------------------------------------------------------------------------
// video — video player
// ---------------------------------------------------------------------------
registerElement('video', {
  category: ElementCategory.Video,
  viewType: ViewType.UIView,
  yogaDefaults: {},
  defaultStyles: {},
  accessibility: {
    role: 'video',
    isAccessibilityElement: true,
  },
  eventSupport: {
    supportsClick: true,
    supportsTouch: true,
    supportsLoad: true,
  },
  validProps: [
    ...commonProps,
    'src',
    'poster',
    'autoPlay',
    'controls',
    'loop',
    'muted',
    'onPlay',
    'onPause',
    'onEnded',
    'onError',
    'onLoad',
  ],
  canHaveChildren: false,
  isLeafNode: true,
  breaksTextContext: true,
});
