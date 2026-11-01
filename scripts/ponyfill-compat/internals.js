'use strict';

// Usage: node internals.js <test file>...
// Prints the names of tests whose source reads store internals
// (store._records, _head, _headQueue, _initial, _reducer).

const fs = require('fs');
const parser = require('@babel/parser');

const RE = /\._(records|head|headQueue|initial|reducer)\b/;

function walk(node, ancestors, out, src) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    ['describe', 'it', 'test'].includes(node.callee.name) &&
    node.arguments[0] &&
    (node.arguments[0].type === 'StringLiteral' ||
      node.arguments[0].type === 'TemplateLiteral')
  ) {
    const name =
      node.arguments[0].type === 'StringLiteral'
        ? node.arguments[0].value
        : node.arguments[0].quasis.map(q => q.value.cooked).join('${}');
    if (node.callee.name === 'describe') {
      for (const arg of node.arguments.slice(1)) {
        walk(arg, [...ancestors, name], out, src);
      }
      return;
    }
    const body = src.slice(node.start, node.end);
    if (RE.test(body)) {
      out.push([...ancestors, name].join(' '));
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments'
    ) {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach(c => walk(c, ancestors, out, src));
    } else if (child && typeof child === 'object') {
      walk(child, ancestors, out, src);
    }
  }
}

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(src, {
    sourceType: 'module',
    plugins: ['jsx', 'flow', 'classProperties'],
  });
  const out = [];
  walk(ast.program, [], out, src);
  for (const name of out) {
    console.log(file + ' :: ' + name);
  }
}
