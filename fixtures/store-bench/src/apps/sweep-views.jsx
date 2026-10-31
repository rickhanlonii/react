// Shared by the sweep-* apps (the coverage and width sweeps, see
// src/redux-suite/suites.mjs). Each build sets two defines:
//
// - __WIDTH__: how many props the row view takes (4, 8 or 16). `selected`
//   plus the first __WIDTH__ - 1 of FIELDS.
// - __COVERAGE__: the percentage of rows rendered by compiled components. The
//   rest render a copy of the row and the row view marked 'use no memo', on a
//   fixed subset of indexes. In the build without the compiler, every row is
//   uncompiled.

/* global __COVERAGE__, __WIDTH__ */

import {countRender, work} from '../shared/views';

export const WIDTH = __WIDTH__;
export const COVERAGE = __COVERAGE__;

const EXTRA_FIELDS = 12;

// Adds f0..f11 to every entity, so a row can take up to 16 props.
export function addFields(entities) {
  return entities.map(e => {
    const wide = {...e};
    for (let k = 0; k < EXTRA_FIELDS; k++) {
      wide['f' + k] = (e.x * (k + 3) + e.y * (k + 1)) % 1000;
    }
    return wide;
  });
}

// Spreads the compiled rows over the list: 61 is coprime with 100, so every
// block of 100 rows has exactly COVERAGE compiled rows.
export function isCompiledRow(index) {
  return (index * 61) % 100 < COVERAGE;
}

function expensiveLabel(label, x, y) {
  let hash = 0;
  for (let i = 0; i < work.iterations; i++) {
    for (let j = 0; j < label.length; j++) {
      hash = (hash * 31 + label.charCodeAt(j) + x + y + i) | 0;
    }
  }
  return label + ' #' + (hash >>> 0).toString(36);
}

const FIELDS = ['label', 'x', 'y', 'color'];
for (let k = 0; k < EXTRA_FIELDS; k++) {
  FIELDS.push('f' + k);
}

// The same component twice: compiled, and marked 'use no memo'.

export function WideRowView(props) {
  countRender('rowview');
  const text = expensiveLabel(props.label, props.x, props.y);
  const fields = [];
  for (let i = 3; i < FIELDS.length; i++) {
    const value = props[FIELDS[i]];
    if (value !== undefined) {
      fields.push(
        <span key={FIELDS[i]} className={FIELDS[i]}>
          {value}
        </span>
      );
    }
  }
  return (
    <li className={props.selected ? 'row selected' : 'row'}>
      <span className="label">{text}</span>
      {fields}
    </li>
  );
}

export function WideRowViewNoMemo(props) {
  'use no memo';
  countRender('rowview');
  const text = expensiveLabel(props.label, props.x, props.y);
  const fields = [];
  for (let i = 3; i < FIELDS.length; i++) {
    const value = props[FIELDS[i]];
    if (value !== undefined) {
      fields.push(
        <span key={FIELDS[i]} className={FIELDS[i]}>
          {value}
        </span>
      );
    }
  }
  return (
    <li className={props.selected ? 'row selected' : 'row'}>
      <span className="label">{text}</span>
      {fields}
    </li>
  );
}
