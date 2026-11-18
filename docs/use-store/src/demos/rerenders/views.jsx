// The presentational components, shared by every panel, so the panels only
// differ in how they read state.

import {countRender} from './counts';

export function RowView({label, selected}) {
  countRender('RowView');
  return (
    <li className={selected ? 'row selected' : 'row'} aria-selected={selected}>
      {label}
    </li>
  );
}

export function ListView({children}) {
  countRender('ListView');
  return <ul className="rows">{children}</ul>;
}
