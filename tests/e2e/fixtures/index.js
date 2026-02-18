'use strict';

module.exports = {
  'div-basic': {component: require('./div-basic'), description: 'Basic div with dimensions'},
  'div-nested': {component: require('./div-nested'), description: 'Nested divs with block layout'},
  'p-text': {component: require('./p-text'), description: 'Paragraph with text content'},
  'headings': {component: require('./headings'), description: 'h1 through h6'},
  'flex-row': {component: require('./flex-row'), description: 'Flex row with gap'},
  'flex-align': {component: require('./flex-align'), description: 'Flex alignment (justify-content, align-items)'},
  'flex-layout': {component: require('./flex-layout'), description: 'Padded container with block children'},
  'box-model': {component: require('./box-model'), description: 'Margin and padding combinations'},
  'border-basic': {component: require('./border-basic'), description: 'Border width (uniform and per-side)'},
  'border-padding': {component: require('./border-padding'), description: 'Border width combined with padding'},
};
