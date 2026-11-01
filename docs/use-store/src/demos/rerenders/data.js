// The rows every panel renders.

export const initialRows = [
  {id: 'r1', label: 'Apples'},
  {id: 'r2', label: 'Bread'},
  {id: 'r3', label: 'Coffee'},
  {id: 'r4', label: 'Dates'},
  {id: 'r5', label: 'Eggs'},
  {id: 'r6', label: 'Figs'},
];

export function editLabel(label) {
  return label.endsWith('!') ? label.slice(0, -1) : label + '!';
}
