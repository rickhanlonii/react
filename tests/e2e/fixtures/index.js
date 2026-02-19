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
  'text-inline': {component: require('./text-inline'), description: 'Inline text styling (bold, italic, underline, code)'},
  'list-basic': {component: require('./list-basic'), description: 'Unordered and ordered lists'},
  'position-absolute': {component: require('./position-absolute'), description: 'Absolute positioning with top/left/right/bottom'},
  'flex-wrap': {component: require('./flex-wrap'), description: 'Flex row with wrap and gap'},
  'flex-grow': {component: require('./flex-grow'), description: 'Flex grow distribution'},
  'semantic-layout': {component: require('./semantic-layout'), description: 'Semantic elements (header, nav, main, section, aside, footer)'},
  'table-basic': {component: require('./table-basic'), description: 'Table with thead, tbody, tr, th, td'},
  'form-basic': {component: require('./form-basic'), description: 'Form with label, input, and button elements'},
  'article-content': {component: require('./article-content'), description: 'Article with blockquote, hr, code, and link'},
};
