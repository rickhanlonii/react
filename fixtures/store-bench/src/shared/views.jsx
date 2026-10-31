// Presentational components shared by every variant, so every variant renders
// the same DOM. The variants only differ in how they get the data.

/* global __COUNT__ */

export const counts = {renders: 0, rows: 0, selectors: 0};

export function countRender(kind) {
  if (__COUNT__) {
    counts.renders++;
    if (kind === 'row') {
      counts.rows++;
    }
  }
}

// Wraps a selector so the counting build records how often it runs.
export function counted(selector) {
  if (!__COUNT__) {
    return selector;
  }
  return function countedSelector(...args) {
    counts.selectors++;
    return selector(...args);
  };
}

export function resetCounts() {
  counts.renders = 0;
  counts.rows = 0;
  counts.selectors = 0;
}

// A fixed amount of render work per row, so there's something for the compiler
// to skip when a row's props don't change. The amount is configurable so the
// responsiveness scenario can make rows expensive.
export const work = {iterations: 50};

function expensiveLabel(label, x, y) {
  let hash = 0;
  for (let i = 0; i < work.iterations; i++) {
    for (let j = 0; j < label.length; j++) {
      hash = (hash * 31 + label.charCodeAt(j) + x + y + i) | 0;
    }
  }
  return label + ' #' + (hash >>> 0).toString(36);
}

// `details` is the details value when the row itself read it, or null. When a
// child component reads it instead, it is passed as `children` and renders the
// same markup.
export function RowView({
  label,
  x,
  y,
  color,
  selected,
  matches,
  details,
  children,
}) {
  countRender('rowview');
  const text = expensiveLabel(label, x, y);
  return (
    <li
      className={
        (selected ? 'row selected' : 'row') + (matches ? '' : ' hidden')
      }
      style={{color}}>
      <span className="label">{text}</span>
      <span className="pos">
        {x},{y}
      </span>
      {details !== null ? <DetailsView details={details} /> : children}
    </li>
  );
}

export function DetailsView({details}) {
  countRender('details');
  return <span className="details">{details}</span>;
}

export function FilterInput({value, onChange}) {
  return (
    <input
      className="filter"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

export function CountView({count}) {
  countRender('count');
  return <div className="count">{count}</div>;
}
